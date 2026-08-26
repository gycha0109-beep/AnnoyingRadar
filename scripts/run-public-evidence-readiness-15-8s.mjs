import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  PHASE15_8Q_INCIDENT_KEYS,
} from "../lib/sources/approved-canonical-problem-draft.mjs";
import { PHASE15_8P_PROBLEM_SIGNATURE } from "../lib/sources/source-approved-incident-persistence.mjs";
import {
  getPublicEvidenceProviderConfig,
  PUBLIC_EVIDENCE_READINESS_VERSION,
  resolvePublicEvidenceReadiness,
} from "../lib/sources/public-evidence-readiness.mjs";

const PHASE = "15.8S";
const AUDIT_VERSION = "phase15.8s-public-evidence-readiness-v0.1";
const EXPECTED_INCIDENTS = 2;
const EXPECTED_SOURCE_LINKS = 2;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8s-public-evidence-readiness.json";
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
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
    .select("id, problem_signature, title, summary, target_user, situation, category, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_8P_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "Phase 15.8S requires exactly one persisted Canonical draft");
  const draft = data[0];
  assert.equal(draft.status, "draft", "Phase 15.8S requires the Canonical Problem to remain draft");
  assert.equal(draft.published_at, null, "Phase 15.8S draft must remain unpublished");
  assert.equal(draft.archived_at, null, "Phase 15.8S draft must remain active");
  return draft;
}

async function loadIncidentSourcePairs(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("incident_key", PHASE15_8Q_INCIDENT_KEYS)
    .order("incident_key", { ascending: true });
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, EXPECTED_INCIDENTS, "Phase 15.8S requires both approved Incidents");

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .in("incident_id", incidents.map((item) => item.id));
  if (linkError) throw linkError;
  assert.equal(links?.length, EXPECTED_SOURCE_LINKS, "approved Incidents must resolve to exactly two Source links");
  assert.equal(new Set(links.map((item) => item.source_signal_id)).size, EXPECTED_SOURCE_LINKS, "publication Evidence requires two distinct Sources");

  const linkByIncident = new Map();
  for (const link of links) {
    assert.equal(linkByIncident.has(link.incident_id), false, "each approved Incident must have exactly one governed Source link");
    linkByIncident.set(link.incident_id, link);
  }

  const sourceIds = links.map((item) => item.source_signal_id);
  const { data: sources, error: sourceError } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, published_at")
    .in("id", sourceIds);
  if (sourceError) throw sourceError;
  assert.equal(sources?.length, EXPECTED_SOURCE_LINKS, "every approved Source must still exist");
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return incidents.map((incident) => {
    const link = linkByIncident.get(incident.id);
    assert.ok(link, "approved Incident Source link missing");
    const source = sourceById.get(link.source_signal_id);
    assert.ok(source, "approved Source lookup failed");
    assert.equal(source.source_platform, "naver_blog", "Phase 15.8S full-context authority currently supports the approved Naver Blog Sources only");
    assert.ok(String(source.canonical_url ?? "").trim(), "publication Evidence Source requires canonical_url");
    return { incident, source };
  });
}

async function countTargetEvidence(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("public_problem_id", problemId);
  if (error) throw error;
  return count ?? 0;
}

async function countTargetPublicFeed(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_feed")
    .select("*", { count: "exact", head: true })
    .eq("id", problemId);
  if (error) throw error;
  return count ?? 0;
}

function buildSafeEvidenceItem({ incidentKey, source, result }) {
  const excerpt = result.observation?.evidence_excerpt ?? null;
  const sourceKey = String(source.canonical_url ?? "").trim();
  return {
    incident_key: incidentKey,
    source_platform: source.source_platform,
    evidence_state: result.evidence_state,
    ready: result.ready,
    reason_codes: [...(result.reason_codes ?? [])],
    support_level: result.observation?.support_level ?? null,
    evidence_excerpt: excerpt,
    excerpt_length: excerpt?.length ?? 0,
    excerpt_sha256: excerpt ? sha256(excerpt) : null,
    source_key_sha256: sha256(sourceKey),
    source_observed_at: source.published_at ?? null,
    context: {
      status: result.full_context?.status ?? "unavailable",
      content_scope: result.full_context?.content_scope ?? null,
      content_hash: result.full_context?.content_hash ?? null,
      original_char_count: result.full_context?.original_char_count ?? null,
      truncated: Boolean(result.full_context?.truncated),
    },
    recovery: {
      attempted: Boolean(result.recovery?.attempted),
      recovered: Boolean(result.recovery?.recovered),
      attempt_count: Number(result.recovery?.attempt_count ?? 0),
      trigger_reason_code: result.recovery?.trigger_reason_code ?? null,
    },
  };
}

function assertSafeArtifactItem(item) {
  const serialized = JSON.stringify(item);
  for (const forbidden of [
    "source_signal_id",
    "incident_id",
    "canonical_url",
    "fetched_url",
    "content_text",
    "raw_text",
    "public_problem_id",
    "provider_request_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `Phase 15.8S artifact must not contain ${forbidden}`);
  }
}

function summarize(items) {
  const ready = items.filter((item) => item.ready).length;
  const review = items.filter((item) => item.evidence_state === "review").length;
  const blocked = items.filter((item) => item.evidence_state === "blocked").length;
  return {
    total: items.length,
    ready,
    review,
    blocked,
    all_evidence_ready: ready === items.length,
    provider_recovery_attempted: items.filter((item) => item.recovery.attempted).length,
    provider_recovery_recovered: items.filter((item) => item.recovery.recovered).length,
    distinct_source_key_fingerprints: new Set(items.map((item) => item.source_key_sha256)).size,
    distinct_incident_keys: new Set(items.map((item) => item.incident_key)).size,
  };
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();

  const before = await snapshotDomains(client);
  const [draft, pairs] = await Promise.all([
    loadCanonicalDraft(client),
    loadIncidentSourcePairs(client),
  ]);
  const [existingEvidence, targetPublicFeed] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetPublicFeed(client, draft.id),
  ]);
  assert.equal(existingEvidence, 0, "Phase 15.8S starts before Public Evidence persistence");
  assert.equal(targetPublicFeed, 0, "Phase 15.8S Canonical draft must not be public");

  const manifest = {
    phase: PHASE,
    audit_version: AUDIT_VERSION,
    readiness_version: PUBLIC_EVIDENCE_READINESS_VERSION,
    problem_signature: draft.problem_signature,
    expected_incident_count: EXPECTED_INCIDENTS,
    expected_source_count: EXPECTED_SOURCE_LINKS,
    current_evidence_count: existingEvidence,
    current_target_public_feed_rows: targetPublicFeed,
    database_writes_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    const afterEstimate = await snapshotDomains(client);
    assert.deepEqual(afterEstimate, before, "Phase 15.8S estimate mode must be read-only");
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      manifest,
      public_full_context_fetches_max: EXPECTED_SOURCE_LINKS,
      paid_external_model_calls_max: EXPECTED_SOURCE_LINKS * 2,
      database_write_statements: 0,
      artifact_contains_full_body: false,
    }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_PAID_PUBLIC_EVIDENCE_READINESS,
    "true",
    "Live Phase 15.8S requires ALLOW_PAID_PUBLIC_EVIDENCE_READINESS=true",
  );
  const provider = getPublicEvidenceProviderConfig(process.env);
  const items = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const { incident, source } = pairs[index];
    const result = await resolvePublicEvidenceReadiness(source, draft, {
      env: {
        ...process.env,
        OPENAI_PUBLIC_EVIDENCE_MODEL: provider.model,
      },
      maxSemanticAttempts: 2,
    });
    const safeItem = buildSafeEvidenceItem({ incidentKey: incident.incident_key, source, result });
    assertSafeArtifactItem(safeItem);
    items.push(safeItem);
    console.log(`[evidence-readiness] ${index + 1}/${pairs.length} state=${safeItem.evidence_state} ready=${safeItem.ready} retry_attempted=${safeItem.recovery.attempted}`);
  }

  assert.equal(items.length, EXPECTED_SOURCE_LINKS, "Phase 15.8S must audit exactly two Source-bound Incidents");
  assert.equal(new Set(items.map((item) => item.incident_key)).size, EXPECTED_INCIDENTS, "Evidence plans must cover two distinct Incidents");
  assert.equal(new Set(items.map((item) => item.source_key_sha256)).size, EXPECTED_SOURCE_LINKS, "Evidence plans must represent two distinct Sources");

  const summary = summarize(items);
  const after = await snapshotDomains(client);
  assert.deepEqual(after, before, "Phase 15.8S must remain database read-only");
  const [evidenceAfter, targetPublicFeedAfter] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetPublicFeed(client, draft.id),
  ]);
  assert.equal(evidenceAfter, 0, "Phase 15.8S must not persist Public Evidence");
  assert.equal(targetPublicFeedAfter, 0, "Phase 15.8S must not publish the draft");

  const structuralSimulation = {
    proposed_evidence_count: items.filter((item) => item.ready).length,
    distinct_source_key_count: summary.distinct_source_key_fingerprints,
    distinct_incident_count: summary.distinct_incident_keys,
    source_incident_bindings_valid: pairs.length === 2,
    title_nonempty: Boolean(String(draft.title ?? "").trim()),
    summary_nonempty: Boolean(String(draft.summary ?? "").trim()),
    would_meet_current_publication_cardinality_if_exact_plans_were_persisted:
      summary.all_evidence_ready
      && summary.distinct_source_key_fingerprints >= 2
      && summary.distinct_incident_keys >= 2
      && Boolean(String(draft.title ?? "").trim())
      && Boolean(String(draft.summary ?? "").trim()),
  };

  const artifact = {
    authority: "publication_evidence_readiness_read_only",
    manifest,
    provider: { name: "openai", model: provider.model },
    summary,
    structural_simulation: structuralSimulation,
    items,
    database_before: before,
    database_after: after,
    downstream_authority: {
      public_evidence_rows_written: 0,
      existing_problem_mutations: 0,
      status_transitions: 0,
      publication_mutations: 0,
      public_evidence_persistence_authorized: false,
      publication_authorized: false,
    },
    raw_source_ids_emitted: false,
    raw_incident_ids_emitted: false,
    public_problem_id_emitted: false,
    full_source_bodies_persisted: 0,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_EVIDENCE_READINESS_COMPLETE",
    problem_signature: draft.problem_signature,
    summary,
    structural_simulation: structuralSimulation,
    database_write_statements: 0,
    protected_domains_unchanged: true,
    public_evidence_rows_written: 0,
    target_public_feed_rows: 0,
    publication_performed: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8S] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
