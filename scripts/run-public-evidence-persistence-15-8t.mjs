import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import { assertStableCanonicalContexts } from "../lib/sources/historical-evidence-span-readiness.mjs";
import {
  PHASE15_8T_EVIDENCE_AUTHORITIES,
  PHASE15_8T_PROBLEM_SIGNATURE,
  PHASE15_8T_VERSION,
  reconstructPhase15_8TEvidence,
  safePhase15_8TEvidenceReadback,
  validatePhase15_8TEvidenceAuthorities,
} from "../lib/sources/public-evidence-persistence-pair.mjs";

const PHASE = "15.8T";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8t-public-evidence-persistence.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotDomains(client) {
  const tables = [
    ["source_signals", "ar_source_signals"],
    ["source_observations", "ar_source_signal_observations"],
    ["source_ingestion_runs", "ar_source_ingestion_runs"],
    ["raw_inputs", "ar_raw_inputs"],
    ["pain_evidences", "ar_pain_evidences"],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadCanonicalDraft(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("id, problem_signature, title, summary, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_8T_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "Phase 15.8T requires exactly one Canonical Problem identity");
  const draft = data[0];
  assert.equal(draft.status, "draft", "Phase 15.8T requires the target to remain draft");
  assert.equal(draft.published_at, null, "Phase 15.8T target must be unpublished");
  assert.equal(draft.archived_at, null, "Phase 15.8T target must be active");
  return draft;
}

async function loadOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner")
    .order("user_id", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 1, "Phase 15.8T requires exactly one Radar owner curator");
  return data[0].user_id;
}

async function loadIncidentSourcePairs(client) {
  const incidentKeys = PHASE15_8T_EVIDENCE_AUTHORITIES.map((item) => item.incident_key);
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("incident_key", incidentKeys);
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 2, "Phase 15.8T requires both approved Incidents");

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .in("incident_id", incidents.map((item) => item.id));
  if (linkError) throw linkError;
  assert.equal(links?.length, 2, "Phase 15.8T approved Incidents must retain exactly two governed Source links");
  assert.equal(new Set(links.map((item) => item.source_signal_id)).size, 2,
    "Phase 15.8T requires two distinct Source Signals");

  const linkByIncident = new Map();
  for (const link of links) {
    assert.equal(linkByIncident.has(link.incident_id), false,
      "each Phase 15.8T Incident must retain exactly one Source link");
    linkByIncident.set(link.incident_id, link);
  }

  const { data: sources, error: sourceError } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, published_at")
    .in("id", links.map((item) => item.source_signal_id));
  if (sourceError) throw sourceError;
  assert.equal(sources?.length, 2, "Phase 15.8T governed Sources must still exist");
  const sourceById = new Map(sources.map((item) => [item.id, item]));

  return new Map(incidents.map((incident) => {
    const link = linkByIncident.get(incident.id);
    assert.ok(link, "Phase 15.8T Incident link lookup failed");
    const source = sourceById.get(link.source_signal_id);
    assert.ok(source, "Phase 15.8T Source lookup failed");
    return [incident.incident_key, { incident, source }];
  }));
}

async function countTargetEvidence(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("public_problem_id", problemId);
  if (error) throw error;
  return count ?? 0;
}

async function countTargetFeed(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_feed")
    .select("*", { count: "exact", head: true })
    .eq("id", problemId);
  if (error) throw error;
  return count ?? 0;
}

async function loadTargetEvidenceReadback(client, problemId, pairByKey) {
  const { data, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("excerpt, publication_basis, source_type, source_key, source_signal_id, incident_id, order_index")
    .eq("public_problem_id", problemId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 2, "Phase 15.8T must persist exactly two target Evidence rows");

  const incidentKeyById = new Map([...pairByKey.values()].map(({ incident }) => [incident.id, incident.incident_key]));
  return data.map((row) => {
    const incidentKey = incidentKeyById.get(row.incident_id);
    assert.ok(incidentKey, "Phase 15.8T readback Incident must be one of the frozen pair");
    return { ...row, incident_key: incidentKey };
  });
}

function assertOnlyEvidenceMutation(before, after) {
  for (const key of [
    "source_signals",
    "source_observations",
    "source_ingestion_runs",
    "raw_inputs",
    "pain_evidences",
    "public_problems",
    "public_feed",
    "source_incidents",
    "source_incident_links",
    "full_context_outcomes",
  ]) {
    assert.equal(after[key], before[key], `Phase 15.8T must not mutate ${key} row count`);
  }
  assert.equal(after.public_evidence, before.public_evidence + 2,
    "Phase 15.8T must create exactly two Public Evidence rows");
}

function assertSafeArtifact(artifact) {
  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id", "incident_id", "public_problem_id", "canonical_url", "source_url",
    "source_key", "excerpt", "content_text", "raw_text", "provider_request_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false,
      `Phase 15.8T artifact must not contain ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const authorities = validatePhase15_8TEvidenceAuthorities();

  const [draft, pairByKey, before] = await Promise.all([
    loadCanonicalDraft(client),
    loadIncidentSourcePairs(client),
    snapshotDomains(client),
  ]);
  const [targetEvidenceBefore, targetFeedBefore] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetFeed(client, draft.id),
  ]);
  assert.equal(targetEvidenceBefore, 0, "Phase 15.8T requires zero target Evidence rows before persistence");
  assert.equal(targetFeedBefore, 0, "Phase 15.8T target must remain absent from public feed");

  const manifest = {
    phase: PHASE,
    persistence_version: PHASE15_8T_VERSION,
    problem_signature: PHASE15_8T_PROBLEM_SIGNATURE,
    evidence_count: 2,
    distinct_source_authorities: 2,
    distinct_incident_authorities: 2,
    canonical_fetches_per_source: 2,
    public_full_context_fetches_max: 4,
    paid_external_model_calls: 0,
    atomic_rpc_calls: 1,
    publishability_asserted_inside_atomic_rpc: true,
    problem_status_transition_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    console.log(JSON.stringify({ status: "ESTIMATE_ONLY", manifest, database_before: before }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PUBLIC_EVIDENCE_PAIR_PERSISTENCE, "true",
    "live Phase 15.8T requires ALLOW_PUBLIC_EVIDENCE_PAIR_PERSISTENCE=true");

  const curatorUserId = await loadOwnerCurator(client);
  const persistenceItems = [];
  const safePlans = [];
  for (const authority of authorities) {
    const pair = pairByKey.get(authority.incident_key);
    assert.ok(pair, `Phase 15.8T pair missing for ${authority.incident_key}`);
    const first = await fetchSourceFullContext(pair.source);
    const second = await fetchSourceFullContext(pair.source);
    const canonicalContext = assertStableCanonicalContexts(first, second);
    const item = reconstructPhase15_8TEvidence({
      authority,
      incident: pair.incident,
      source: pair.source,
      canonicalContext,
    });
    persistenceItems.push(item);
    safePlans.push({
      order_index: authority.order_index,
      incident_key: authority.incident_key,
      source_key_sha256: authority.source_key_sha256,
      excerpt_length: authority.excerpt_length,
      excerpt_sha256: authority.excerpt_sha256,
      readiness_authority: authority.readiness_authority,
      current_context_hash: canonicalContext.content_hash,
      current_context_chars: canonicalContext.original_char_count,
      current_context_stable: true,
      exact_span_reconstructed_uniquely: true,
    });
  }

  assert.equal(persistenceItems.length, 2);
  const { data: rpcResult, error: rpcError } = await client.rpc(
    "ar_add_incident_bound_public_problem_evidence_pair",
    {
      p_problem_id: draft.id,
      p_curator_user_id: curatorUserId,
      p_evidences: persistenceItems,
    },
  );
  if (rpcError) throw rpcError;
  assert.ok(Array.isArray(rpcResult), "Phase 15.8T atomic pair RPC must return an array");
  assert.equal(rpcResult.length, 2, "Phase 15.8T atomic pair RPC must return exactly two rows");

  const [readbackRows, draftAfter, targetFeedAfter, after] = await Promise.all([
    loadTargetEvidenceReadback(client, draft.id, pairByKey),
    loadCanonicalDraft(client),
    countTargetFeed(client, draft.id),
    snapshotDomains(client),
  ]);
  assert.equal(draftAfter.id, draft.id, "Phase 15.8T must retain the same Canonical Problem identity");
  assert.equal(draftAfter.status, "draft", "Phase 15.8T must leave the Canonical Problem in draft");
  assert.equal(targetFeedAfter, 0, "Phase 15.8T must not expose the draft in public feed");
  assertOnlyEvidenceMutation(before, after);

  const safeReadback = readbackRows.map(safePhase15_8TEvidenceReadback);
  assert.deepEqual(safeReadback.map((row) => row.order_index), [0, 1]);
  for (const [index, authority] of authorities.entries()) {
    const row = safeReadback[index];
    assert.equal(row.incident_key, authority.incident_key);
    assert.equal(row.source_key_sha256, authority.source_key_sha256);
    assert.equal(row.excerpt_length, authority.excerpt_length);
    assert.equal(row.excerpt_sha256, authority.excerpt_sha256);
    assert.equal(row.publication_basis, "external_public");
    assert.equal(row.source_type, "naver_blog");
    assert.equal(row.lineage_bound, true);
  }

  const artifact = {
    authority: "atomic_incident_bound_public_evidence_pair_persistence",
    manifest,
    evidence_plans: safePlans,
    evidence_readback: safeReadback,
    database_before: before,
    database_after: after,
    target_evidence_before: 0,
    target_evidence_after: 2,
    target_public_feed_after: 0,
    target_status_after: "draft",
    raw_source_ids_emitted: false,
    raw_incident_ids_emitted: false,
    public_problem_id_emitted: false,
    evidence_excerpt_text_emitted: false,
    full_source_bodies_persisted_outside_evidence_excerpt: 0,
    status_transition_performed: false,
    publication_performed: false,
  };
  assertSafeArtifact(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "PUBLIC_EVIDENCE_PAIR_PERSISTENCE_COMPLETE",
    problem_signature: PHASE15_8T_PROBLEM_SIGNATURE,
    evidence_rows_created: 2,
    distinct_sources: 2,
    distinct_incidents: 2,
    atomic_rpc_calls: 1,
    publishability_asserted_inside_atomic_rpc: true,
    target_status: "draft",
    target_public_feed_rows: 0,
    status_transition_performed: false,
    publication_performed: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8T] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
