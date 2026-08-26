import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  buildPhase15_8QCanonicalDraft,
  PHASE15_8Q_INCIDENT_KEYS,
} from "../lib/sources/approved-canonical-problem-draft.mjs";
import {
  assertPersistedCanonicalDraftMatchesPlan,
  buildCanonicalDraftOnlyPersistencePlan,
  CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION,
} from "../lib/sources/canonical-draft-only-persistence.mjs";

const LIVE_FLAG = "--live";
const ALLOW_ENV = "ALLOW_CANONICAL_DRAFT_PERSISTENCE";

function isLive(argv = process.argv.slice(2)) {
  return argv.includes(LIVE_FLAG);
}

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8r-canonical-draft-persistence.json";
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

async function loadApprovedIncidentLinks(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("incident_key", PHASE15_8Q_INCIDENT_KEYS)
    .order("incident_key", { ascending: true });
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 2, "Phase 15.8R requires both approved persisted Incidents");

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .in("incident_id", incidents.map((item) => item.id))
    .order("incident_id", { ascending: true });
  if (linkError) throw linkError;
  assert.equal(links?.length, 2, "approved persisted Incidents must each have exactly one Source link");

  const incidentKeyById = new Map(incidents.map((item) => [item.id, item.incident_key]));
  return links.map((link) => ({
    incident_key: incidentKeyById.get(link.incident_id),
    source_signal_id: link.source_signal_id,
  }));
}

async function loadPublicProblems(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("title, summary, target_user, situation, category, status, published_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadCanonicalRows(client, signature) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("problem_signature, title, summary, target_user, situation, category, status, published_at, archived_at, id")
    .eq("problem_signature", signature);
  if (error) throw error;
  assert.ok((data?.length ?? 0) <= 1, "problem_signature uniqueness authority violated");
  return data ?? [];
}

async function loadOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner");
  if (error) throw error;
  assert.equal(data?.length, 1, "Phase 15.8R requires exactly one owner curator authority");
  return data[0].user_id;
}

async function countDraftEvidence(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("public_problem_id", problemId);
  if (error) throw error;
  return count ?? 0;
}

async function countDraftPublicFeedRows(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_feed")
    .select("*", { count: "exact", head: true })
    .eq("id", problemId);
  if (error) throw error;
  return count ?? 0;
}

function normalizeRpcRow(data) {
  if (Array.isArray(data)) {
    assert.equal(data.length, 1, "canonical draft RPC must return exactly one row");
    return data[0];
  }
  return data;
}

function assertProtectedCounts({ before, after, created }) {
  const expected = { ...before };
  if (created) expected.public_problems += 1;
  assert.deepEqual(after, expected, "Phase 15.8R mutated a protected domain outside the one draft row");
}

async function main() {
  const live = isLive();
  const outputPath = parseOutputPath();
  const client = createServiceClient();

  const before = await snapshotDomains(client);
  const [incidentLinks, publicProblems] = await Promise.all([
    loadApprovedIncidentLinks(client),
    loadPublicProblems(client),
  ]);
  const qAuthority = buildPhase15_8QCanonicalDraft({ incidentLinks, publicProblems });
  const plan = buildCanonicalDraftOnlyPersistencePlan({ draftResult: qAuthority.draft_result });
  const signature = plan.args.p_problem_signature;

  let rows = await loadCanonicalRows(client, signature);
  let persistedRow = rows[0] ?? null;
  let created = false;
  let writeRpcCalls = 0;

  if (persistedRow) {
    assertPersistedCanonicalDraftMatchesPlan({ row: persistedRow, plan });
  } else if (live) {
    if (process.env[ALLOW_ENV] !== "true") {
      throw new Error(`${ALLOW_ENV}=true is required for live Canonical draft persistence`);
    }
    const curatorUserId = await loadOwnerCurator(client);
    const { data, error } = await client.rpc("ar_create_canonical_public_problem_draft", {
      p_curator_user_id: curatorUserId,
      ...plan.args,
    });
    writeRpcCalls += 1;
    if (error) throw error;
    persistedRow = normalizeRpcRow(data);
    created = true;
    assertPersistedCanonicalDraftMatchesPlan({ row: persistedRow, plan });
  }

  if (!live && !persistedRow) {
    const afterEstimate = await snapshotDomains(client);
    assert.deepEqual(afterEstimate, before, "estimate mode must be read-only");
    const estimate = {
      status: "READY_FOR_DRAFT_ONLY_PERSISTENCE",
      version: CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION,
      problem_signature: signature,
      source_count: plan.invariants.source_count,
      incident_count: plan.invariants.incident_count,
      existing_canonical_draft: false,
      database_mutations: 0,
      public_evidence_write_count: 0,
      publication_count: 0,
    };
    await writeFile(outputPath, `${JSON.stringify(estimate, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(estimate, null, 2));
    return;
  }

  rows = await loadCanonicalRows(client, signature);
  assert.equal(rows.length, 1, "exactly one persisted Canonical draft is required after Phase 15.8R");
  persistedRow = rows[0];
  assertPersistedCanonicalDraftMatchesPlan({ row: persistedRow, plan });

  const [evidenceCount, publicFeedRows] = await Promise.all([
    countDraftEvidence(client, persistedRow.id),
    countDraftPublicFeedRows(client, persistedRow.id),
  ]);
  assert.equal(evidenceCount, 0, "Phase 15.8R must not create Public Evidence");
  assert.equal(publicFeedRows, 0, "draft Public Problem must not appear in the anonymous public feed");

  const after = await snapshotDomains(client);
  assertProtectedCounts({ before, after, created });

  const artifact = {
    status: created ? "CANONICAL_DRAFT_PERSISTED" : "CANONICAL_DRAFT_ALREADY_PERSISTED",
    version: CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION,
    problem_signature: signature,
    source_count: plan.invariants.source_count,
    incident_count: plan.invariants.incident_count,
    public_problem_status: persistedRow.status,
    canonical_draft_rows_for_signature: rows.length,
    canonical_draft_evidence_count: evidenceCount,
    canonical_draft_public_feed_rows: publicFeedRows,
    write_rpc_calls: writeRpcCalls,
    public_problem_id_emitted: false,
    source_signal_ids_emitted: false,
    database_before: before,
    database_after: after,
    public_evidence_write_count: 0,
    existing_problem_mutation_count: 0,
    publication_count: 0,
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: artifact.status,
    problem_signature: signature,
    public_problem_status: persistedRow.status,
    canonical_draft_rows_for_signature: rows.length,
    canonical_draft_evidence_count: evidenceCount,
    canonical_draft_public_feed_rows: publicFeedRows,
    write_rpc_calls: writeRpcCalls,
    public_problem_id_emitted: false,
    public_evidence_write_count: 0,
    publication_count: 0,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8R] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
