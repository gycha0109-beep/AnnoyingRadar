import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import { PHASE15_8P_PROBLEM_SIGNATURE } from "../lib/sources/source-approved-incident-persistence.mjs";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import { buildCombinedEvidenceReadiness } from "../lib/sources/public-evidence-residual.mjs";
import {
  HISTORICAL_EVIDENCE_SPAN_PROMPT_VERSION,
  HISTORICAL_EVIDENCE_SPAN_READINESS_VERSION,
  PHASE15_8S_X_CONTEXT_STABILITY_FETCHES,
  PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256,
  PHASE15_8S_X_HISTORICAL_SPAN_LENGTH,
  PHASE15_8S_X_HISTORICAL_SPAN_SHA256,
  PHASE15_8S_X_INCIDENT_KEY,
  assertStableCanonicalContexts,
  decideHistoricalSpanReadiness,
  getHistoricalEvidenceProviderConfig,
  judgeHistoricalFixedSpanSupport,
  reconstructUniqueHistoricalSpan,
  sha256,
} from "../lib/sources/historical-evidence-span-readiness.mjs";

const PHASE = "15.8S-X";
const AUDIT_VERSION = "phase15.8s-x-historical-evidence-span-readiness-v0.1";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8s-x-historical-evidence-span-readiness.json";
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
    .eq("problem_signature", PHASE15_8P_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.8S-X requires exactly one Canonical draft");
  const draft = data[0];
  assert.equal(draft.status, "draft", "15.8S-X requires the Canonical Problem to remain draft");
  assert.equal(draft.published_at, null, "15.8S-X draft must remain unpublished");
  assert.equal(draft.archived_at, null, "15.8S-X draft must remain active");
  return draft;
}

async function loadTargetIncidentSource(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .eq("incident_key", PHASE15_8S_X_INCIDENT_KEY);
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 1, "15.8S-X target Incident authority must resolve exactly once");
  const incident = incidents[0];

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .eq("incident_id", incident.id);
  if (linkError) throw linkError;
  assert.equal(links?.length, 1, "15.8S-X target Incident must retain exactly one curator-approved Source link");

  const { data: sources, error: sourceError } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, published_at")
    .eq("id", links[0].source_signal_id);
  if (sourceError) throw sourceError;
  assert.equal(sources?.length, 1, "15.8S-X approved Source must still exist");
  const source = sources[0];
  assert.equal(source.source_platform, "naver_blog", "15.8S-X target Source must remain Naver Blog");
  assert.ok(String(source.canonical_url ?? "").trim(), "15.8S-X target Source requires canonical_url");
  assert.equal(
    sha256(String(source.canonical_url).trim()),
    PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256,
    "15.8S-X target Source identity drifted from 15.8S authority",
  );
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

async function countTargetPublicFeed(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_feed")
    .select("*", { count: "exact", head: true })
    .eq("id", problemId);
  if (error) throw error;
  return count ?? 0;
}

function assertSafeArtifact(artifact) {
  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "incident_id",
    "canonical_url",
    "fetched_url",
    "content_text",
    "raw_text",
    "public_problem_id",
    "provider_request_id",
    "fixed_exact_span",
    "evidence_excerpt",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `15.8S-X artifact must not contain ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const before = await snapshotDomains(client);
  const [draft, pair] = await Promise.all([
    loadCanonicalDraft(client),
    loadTargetIncidentSource(client),
  ]);
  const [targetEvidenceBefore, targetFeedBefore] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetPublicFeed(client, draft.id),
  ]);
  assert.equal(targetEvidenceBefore, 0, "15.8S-X starts before Public Evidence persistence");
  assert.equal(targetFeedBefore, 0, "15.8S-X target draft must remain absent from public feed");

  const manifest = {
    phase: PHASE,
    audit_version: AUDIT_VERSION,
    readiness_version: HISTORICAL_EVIDENCE_SPAN_READINESS_VERSION,
    prompt_version: HISTORICAL_EVIDENCE_SPAN_PROMPT_VERSION,
    problem_signature: draft.problem_signature,
    target_incident_key: pair.incident.incident_key,
    source_key_sha256: PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256,
    historical_span_length: PHASE15_8S_X_HISTORICAL_SPAN_LENGTH,
    historical_span_sha256: PHASE15_8S_X_HISTORICAL_SPAN_SHA256,
    historical_authority: "phase15.8n_formation_exact_evidence_quote_plus_phase15.8p_curator_acceptance",
    current_context_stability_fetches_required: PHASE15_8S_X_CONTEXT_STABILITY_FETCHES,
    fixed_span_generated_by_model: false,
    database_writes_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    const afterEstimate = await snapshotDomains(client);
    assert.deepEqual(afterEstimate, before, "15.8S-X estimate mode must be read-only");
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      manifest,
      public_full_context_fetches_max: 2,
      paid_external_model_calls_max: 1,
      database_write_statements: 0,
      artifact_contains_fixed_span_text: false,
    }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_PAID_HISTORICAL_EVIDENCE_SPAN_READINESS,
    "true",
    "Live 15.8S-X requires ALLOW_PAID_HISTORICAL_EVIDENCE_SPAN_READINESS=true",
  );

  const provider = getHistoricalEvidenceProviderConfig(process.env);
  const contexts = [];
  for (let index = 0; index < PHASE15_8S_X_CONTEXT_STABILITY_FETCHES; index += 1) {
    contexts.push(await fetchSourceFullContext(pair.source));
  }
  assert.equal(contexts.length, 2, "15.8S-X must fetch the current canonical source exactly twice");
  const canonicalContext = assertStableCanonicalContexts(contexts[0], contexts[1]);

  const reconstructed = reconstructUniqueHistoricalSpan(canonicalContext.content_text);
  assert.equal(reconstructed.text.length, PHASE15_8S_X_HISTORICAL_SPAN_LENGTH,
    "reconstructed historical span length must remain exact");
  assert.equal(sha256(reconstructed.text), PHASE15_8S_X_HISTORICAL_SPAN_SHA256,
    "reconstructed historical span hash must remain exact");

  let observation = null;
  let observerErrorCode = null;
  try {
    observation = await judgeHistoricalFixedSpanSupport({
      sourcePlatform: pair.source.source_platform,
      sourceTitle: canonicalContext.title,
      fullText: canonicalContext.content_text,
      fixedSpan: reconstructed.text,
      problemTitle: draft.title,
      problemSummary: draft.summary,
      ...provider,
    });
  } catch (error) {
    observerErrorCode = typeof error?.code === "string" ? error.code : "historical_evidence_judge_failed";
  }

  const decision = observation
    ? decideHistoricalSpanReadiness(observation)
    : { evidence_state: "review", ready: false, reason_code: observerErrorCode };
  const acquiredItem = {
    incident_key: pair.incident.incident_key,
    source_key_sha256: PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256,
    evidence_state: decision.evidence_state,
    ready: decision.ready,
    reason_codes: [decision.reason_code],
    support_level: observation?.support_level ?? null,
    excerpt_length: PHASE15_8S_X_HISTORICAL_SPAN_LENGTH,
    excerpt_sha256: PHASE15_8S_X_HISTORICAL_SPAN_SHA256,
    source_observed_at: pair.source.published_at ?? null,
    fixed_span_reconstructed_uniquely: true,
    fixed_span_generated_by_model: false,
    current_context: {
      version: canonicalContext.version,
      status: canonicalContext.status,
      content_scope: canonicalContext.content_scope,
      content_hash: canonicalContext.content_hash,
      original_char_count: canonicalContext.original_char_count,
      truncated: Boolean(canonicalContext.truncated),
      stability_fetch_count: contexts.length,
      stable: true,
    },
    semantic_attempt_count: 1,
  };

  const combinedReadiness = buildCombinedEvidenceReadiness(acquiredItem);
  const after = await snapshotDomains(client);
  assert.deepEqual(after, before, "15.8S-X must remain database read-only");
  const [targetEvidenceAfter, targetFeedAfter] = await Promise.all([
    countTargetEvidence(client, draft.id),
    countTargetPublicFeed(client, draft.id),
  ]);
  assert.equal(targetEvidenceAfter, 0, "15.8S-X must not persist Public Evidence");
  assert.equal(targetFeedAfter, 0, "15.8S-X must not publish the Canonical draft");

  const artifact = {
    authority: "historical_exact_span_public_evidence_readiness_read_only",
    manifest,
    provider: { name: "openai", model: provider.model },
    acquired_item: acquiredItem,
    combined_readiness: combinedReadiness,
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
    fixed_span_text_persisted: false,
  };
  assertSafeArtifact(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_HISTORICAL_EVIDENCE_SPAN_READINESS_COMPLETE",
    evidence_state: acquiredItem.evidence_state,
    ready: acquiredItem.ready,
    reason_codes: acquiredItem.reason_codes,
    support_level: acquiredItem.support_level,
    fixed_span_reconstructed_uniquely: true,
    fixed_span_length: acquiredItem.excerpt_length,
    fixed_span_sha256: acquiredItem.excerpt_sha256,
    current_context_hash: acquiredItem.current_context.content_hash,
    current_context_chars: acquiredItem.current_context.original_char_count,
    current_context_stable: true,
    semantic_attempt_count: 1,
    combined_ready_count: combinedReadiness.ready_count,
    all_evidence_ready: combinedReadiness.all_evidence_ready,
    publication_cardinality_simulation:
      combinedReadiness.would_meet_current_publication_cardinality_if_exact_plans_were_persisted,
    database_write_statements: 0,
    public_evidence_rows_written: 0,
    target_public_feed_rows: 0,
    publication_performed: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8S-X] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
