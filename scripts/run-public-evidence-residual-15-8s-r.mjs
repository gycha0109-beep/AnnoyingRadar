import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import { PHASE15_8P_PROBLEM_SIGNATURE } from "../lib/sources/source-approved-incident-persistence.mjs";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import {
  getPublicEvidenceProviderConfig,
  resolvePublicEvidenceReadiness,
} from "../lib/sources/public-evidence-readiness.mjs";
import {
  assertStableCanonicalContexts,
  buildCombinedEvidenceReadiness,
  createResidualEvidenceJudge,
  PHASE15_8S_R_CONTEXT_STABILITY_FETCHES,
  PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256,
  PHASE15_8S_R_INCIDENT_KEY,
  PHASE15_8S_R_MAX_OUTPUT_TOKENS,
  PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH,
  PHASE15_8S_R_VERSION,
} from "../lib/sources/public-evidence-residual.mjs";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8s-r-public-evidence-residual.json";
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

async function loadDraft(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("id, problem_signature, title, summary, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_8P_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.8S-R requires exactly one target Canonical Problem");
  const draft = data[0];
  assert.equal(draft.status, "draft");
  assert.equal(draft.published_at, null);
  assert.equal(draft.archived_at, null);
  return draft;
}

async function loadResidualPair(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .eq("incident_key", PHASE15_8S_R_INCIDENT_KEY);
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 1, "15.8S-R residual Incident identity drifted");
  const incident = incidents[0];

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .eq("incident_id", incident.id);
  if (linkError) throw linkError;
  assert.equal(links?.length, 1, "15.8S-R residual Incident must have exactly one Source link");

  const { data: sources, error: sourceError } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, published_at")
    .eq("id", links[0].source_signal_id);
  if (sourceError) throw sourceError;
  assert.equal(sources?.length, 1, "15.8S-R residual Source lookup failed");
  const source = sources[0];
  assert.equal(source.source_platform, "naver_blog");
  assert.ok(String(source.canonical_url ?? "").trim());
  assert.equal(sha256(source.canonical_url), PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256,
    "15.8S-R residual source-key identity drifted from authoritative 15.8S artifact");
  return { incident, source };
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

function safeResidualItem({ result, source }) {
  const excerpt = result.observation?.evidence_excerpt ?? null;
  return {
    incident_key: PHASE15_8S_R_INCIDENT_KEY,
    evidence_state: result.evidence_state,
    ready: result.ready,
    reason_codes: [...(result.reason_codes ?? [])],
    support_level: result.observation?.support_level ?? null,
    excerpt_length: excerpt?.length ?? 0,
    excerpt_sha256: excerpt ? sha256(excerpt) : null,
    source_key_sha256: sha256(source.canonical_url),
    source_observed_at: source.published_at ?? null,
    context_fetch_version: result.full_context?.version ?? null,
    context_hash: result.full_context?.content_hash ?? null,
    context_char_count: result.full_context?.original_char_count ?? null,
    context_scope: result.full_context?.content_scope ?? null,
    context_truncated: Boolean(result.full_context?.truncated),
    completion_budget: PHASE15_8S_R_MAX_OUTPUT_TOKENS,
    residual_attempt_count: 1,
    prior_phase_attempt_count: 2,
    total_semantic_attempt_count_across_s_and_s_r: 3,
  };
}

function assertSafeArtifact(item) {
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
    "evidence_excerpt",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `15.8S-R artifact must not contain ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const before = await snapshotDomains(client);
  const [draft, pair] = await Promise.all([loadDraft(client), loadResidualPair(client)]);
  const [targetEvidence, targetFeed] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetFeed(client, draft.id),
  ]);
  assert.equal(targetEvidence, 0, "15.8S-R starts before Public Evidence persistence");
  assert.equal(targetFeed, 0, "15.8S-R target draft must remain non-public");

  if (!live) {
    const afterEstimate = await snapshotDomains(client);
    assert.deepEqual(afterEstimate, before, "15.8S-R estimate mode must be read-only");
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      version: PHASE15_8S_R_VERSION,
      residual_incident_key: PHASE15_8S_R_INCIDENT_KEY,
      historical_prior_context_hash: PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH,
      completion_budget: PHASE15_8S_R_MAX_OUTPUT_TOKENS,
      canonical_context_stability_fetches: PHASE15_8S_R_CONTEXT_STABILITY_FETCHES,
      max_paid_semantic_calls: 1,
      database_write_statements: 0,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_PUBLIC_EVIDENCE_RESIDUAL, "true",
    "live 15.8S-R requires ALLOW_PAID_PUBLIC_EVIDENCE_RESIDUAL=true");

  const canonicalContexts = [];
  for (let index = 0; index < PHASE15_8S_R_CONTEXT_STABILITY_FETCHES; index += 1) {
    canonicalContexts.push(await fetchSourceFullContext(pair.source));
  }
  assert.equal(canonicalContexts.length, 2, "15.8S-R requires exactly two canonical stability fetches");
  const fullContext = assertStableCanonicalContexts(canonicalContexts[0], canonicalContexts[1]);

  const provider = getPublicEvidenceProviderConfig(process.env);
  const judgeContext = createResidualEvidenceJudge({
    ...provider,
    fetchImpl: globalThis.fetch,
  });
  const result = await resolvePublicEvidenceReadiness(pair.source, draft, {
    fetchContext: async () => fullContext,
    judgeContext,
    maxSemanticAttempts: 1,
  });
  const item = safeResidualItem({ result, source: pair.source });
  assertSafeArtifact(item);
  assert.equal(item.context_hash, fullContext.content_hash);
  assert.equal(item.context_char_count, fullContext.original_char_count);
  assert.equal(item.source_key_sha256, PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256);

  const combined = buildCombinedEvidenceReadiness(item);
  const after = await snapshotDomains(client);
  assert.deepEqual(after, before, "15.8S-R must remain database read-only");
  const [targetEvidenceAfter, targetFeedAfter] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetFeed(client, draft.id),
  ]);
  assert.equal(targetEvidenceAfter, 0, "15.8S-R must not persist Public Evidence");
  assert.equal(targetFeedAfter, 0, "15.8S-R must not publish the target draft");

  const artifact = {
    authority: "public_evidence_residual_completion_read_only",
    version: PHASE15_8S_R_VERSION,
    problem_signature: draft.problem_signature,
    provider: { name: "openai", model: provider.model },
    prior_phase_reason: "public_evidence_provider_incomplete",
    residual_strategy: "stable_canonical_context_same_observer_single_higher_completion_budget",
    original_completion_budget: 800,
    residual_completion_budget: PHASE15_8S_R_MAX_OUTPUT_TOKENS,
    context_provenance: {
      historical_prior_fetch_version: "source-full-context-fetch-v0.1",
      historical_prior_context_hash: PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH,
      canonical_fetch_version: fullContext.version,
      canonical_context_hash: fullContext.content_hash,
      canonical_context_char_count: fullContext.original_char_count,
      context_stability_fetch_count: canonicalContexts.length,
      stable_context: true,
    },
    item,
    combined_readiness: combined,
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
    exact_excerpt_persisted_in_artifact: false,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_RESIDUAL_EVIDENCE_COMPLETION_COMPLETE",
    canonical_context_hash: fullContext.content_hash,
    context_stability_fetch_count: canonicalContexts.length,
    stable_context: true,
    residual_state: item.evidence_state,
    residual_ready: item.ready,
    combined_ready_count: combined.ready_count,
    all_evidence_ready: combined.all_evidence_ready,
    would_meet_current_publication_cardinality_if_exact_plans_were_persisted:
      combined.would_meet_current_publication_cardinality_if_exact_plans_were_persisted,
    database_write_statements: 0,
    public_evidence_rows_written: 0,
    publication_performed: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8S-R] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
