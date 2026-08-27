import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { PHASE15_9C_CAMPAIGN_VERSION } from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";
import { selectPhase15_9FExternalPilot } from "../lib/sources/phase15-9f-external-web-pilot.mjs";
import { comparePhase15_9GFetches } from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";
import {
  buildPhase15_9IFrozenCandidateResult,
  PHASE15_9I_BATCH_VERSION,
  PHASE15_9I_CANDIDATE_AUTHORITY,
  PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9I_MODEL_CALLS,
  PHASE15_9I_SAMPLE_FINGERPRINT,
  PHASE15_9I_TARGET_COUNT,
  PHASE15_9I_TARGET_ORDINALS,
  PHASE15_9I_VERSION,
  selectPhase15_9ICandidateTargets,
} from "../lib/sources/phase15-9i-confirmed-fn-outcome-persistence.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { classifySourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "../lib/sources/source-full-context-fetch.mjs";
import {
  buildSourceFullContextOutcomeRow,
  SOURCE_FULL_CONTEXT_OUTCOME_TABLE,
} from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { persistSourceFullContextOutcomeRows } from "../lib/sources/source-full-context-outcome-batch.mjs";
import { resolveFullContextSemantic } from "../lib/sources/source-full-context-resolution.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const SOURCE_CHUNK_SIZE = 100;
const EXPECTED_COHORT = 313;
const EXPECTED_NAVER = 5;
const EXPECTED_EXTERNAL = 308;
const EXPECTED_OUTCOME_TOTAL_BEFORE = 82;
const EXPECTED_OUTCOME_TOTAL_AFTER = 85;
const MODEL_NAME = "gpt-5-mini-2025-08-07";
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const fingerprint = (values) => sha256([...values].map(String).sort().join("\n"));

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9i-confirmed-fn-outcome-persistence.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countBatchRows(client) {
  const { count, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("batch_version", PHASE15_9I_BATCH_VERSION);
  if (error) throw error;
  return count ?? 0;
}

async function countTargetOutcomeRows(client, ids) {
  const { count, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("*", { count: "exact", head: true })
    .in("source_signal_id", ids);
  if (error) throw error;
  return count ?? 0;
}

async function snapshotProtectedDomains(client) {
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
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadCampaignRuns(client) {
  const { data, error } = await client
    .from("ar_source_ingestion_runs")
    .select("id, started_at, completed_at, request_metadata")
    .eq("source_platform", "naver_blog")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const runs = (data ?? []).filter((row) => row.request_metadata?.expanded_campaign_version === PHASE15_9C_CAMPAIGN_VERSION);
  assert.equal(runs.length, 8, "15.9I requires the authoritative eight-run Phase 15.9C campaign");
  assert.equal(new Set(runs.map((row) => row.request_metadata?.expanded_query_key)).size, 8);
  return runs;
}

async function loadObservedIds(client, runIds) {
  const { data, error } = await client
    .from("ar_source_signal_observations")
    .select("source_signal_id, ingestion_run_id")
    .in("ingestion_run_id", runIds)
    .limit(2000);
  if (error) throw error;
  assert.equal((data ?? []).length, 351, "15.9I expects 351 Phase 15.9C observations");
  return [...new Set((data ?? []).map((row) => row.source_signal_id))];
}

async function loadBaseSignals(client, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += SOURCE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SOURCE_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, external_content_id, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, first_seen_at, last_seen_at")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function reconstructNewRejectCohort(signals, runs) {
  const starts = runs.map((row) => Date.parse(row.started_at)).filter(Number.isFinite);
  const ends = runs.map((row) => Date.parse(row.completed_at)).filter(Number.isFinite);
  assert.equal(starts.length, runs.length);
  assert.equal(ends.length, runs.length);
  const lower = Math.min(...starts);
  const upper = Math.max(...ends);
  const cohort = signals
    .filter((signal) => {
      const firstSeen = Date.parse(signal.first_seen_at);
      return Number.isFinite(firstSeen) && firstSeen >= lower && firstSeen <= upper;
    })
    .map((signal) => ({ signal, admission: classifySourceAdmission(signal) }));
  assert.equal(cohort.length, EXPECTED_COHORT, "15.9I must reconstruct exactly 313 newly inserted Sources");
  assert.equal(cohort.every((record) => record.admission.decision === "reject"), true,
    "15.9I baseline cohort must remain rejected by current snippet-level Source Admission authority");
  return cohort;
}

async function loadUrlFields(client, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += SOURCE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SOURCE_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((row) => [row.id, row]));
}

function addOrigin(cohort, urlFieldsById) {
  return cohort.map((record) => {
    const fields = urlFieldsById.get(record.signal.id);
    assert.ok(fields?.canonical_url, "15.9I Source must have canonical URL");
    const signal = { ...record.signal, ...fields };
    const origin = classifySourceOrigin(signal.canonical_url);
    assert.ok(origin, "15.9I Source must have classifiable public HTTP(S) origin");
    return { ...record, signal, origin };
  });
}

function assertContextMatchesHAuthority(first, second, authority) {
  const pair = comparePhase15_9GFetches(first, second);
  assert.equal(pair.stable, true, "15.9I refuses persistence unless the double-fetch pair is stable");
  assert.equal(first.status, "resolved");
  assert.equal(second.status, "resolved");
  assert.equal(first.truncated, false);
  assert.equal(second.truncated, false);
  assert.equal(first.content_scope, "full_post");
  assert.equal(second.content_scope, "full_post");
  assert.equal(first.content_hash, authority.context_hash, "first context hash drifted from Phase 15.9H authority");
  assert.equal(second.content_hash, authority.context_hash, "second context hash drifted from Phase 15.9H authority");
  assert.equal(first.original_char_count, authority.context_chars, "first context length drifted from Phase 15.9H authority");
  assert.equal(second.original_char_count, authority.context_chars, "second context length drifted from Phase 15.9H authority");
  assert.equal(first.content_text.length, authority.context_chars, "judged content length must equal the untruncated H authority");
  assert.equal(second.content_text.length, authority.context_chars, "second content length must equal the untruncated H authority");
  assert.equal(first.extraction_scope, authority.extraction_scope, "first extraction scope drifted from Phase 15.9H authority");
  assert.equal(second.extraction_scope, authority.extraction_scope, "second extraction scope drifted from Phase 15.9H authority");
  assert.equal(sha256(first.title ?? ""), authority.title_sha256, "first title drifted from Phase 15.9H authority");
  assert.equal(sha256(second.title ?? ""), authority.title_sha256, "second title drifted from Phase 15.9H authority");
  return pair;
}

async function loadBatchReadback(client) {
  const { data, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("source_signal_id, status, decision, reason_codes, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind, context_content_sha256, context_char_count, prompt_version, model_name, recovery_attempted, recovery_recovered, recovery_attempt_count, recovery_trigger_reason_code, recovery_terminal_reason_code")
    .eq("batch_version", PHASE15_9I_BATCH_VERSION)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9I",
      version: PHASE15_9I_VERSION,
      baseline_phase: "15.9H",
      batch_version: PHASE15_9I_BATCH_VERSION,
      sample_fingerprint: PHASE15_9I_SAMPLE_FINGERPRINT,
      target_ordinals: PHASE15_9I_TARGET_ORDINALS,
      target_count: PHASE15_9I_TARGET_COUNT,
      max_source_network_requests: PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: PHASE15_9I_MODEL_CALLS,
      database_write_statements_max: 1,
      outcome_rows_max: PHASE15_9I_TARGET_COUNT,
      source_admission_mutation_authorized: false,
      incident_creation_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9I_CONFIRMED_FN_OUTCOME_PERSISTENCE, "true",
    "Phase 15.9I live persistence requires explicit opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  const outcomeTotalBefore = await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);
  assert.equal(outcomeTotalBefore, EXPECTED_OUTCOME_TOTAL_BEFORE, "15.9I expects the closed 82-row full-context outcome baseline");
  assert.equal(await countBatchRows(client), 0, "15.9I batch version already exists; never overwrite or rerun this batch");

  const runs = await loadCampaignRuns(client);
  const observedIds = await loadObservedIds(client, runs.map((row) => row.id));
  const baseSignals = await loadBaseSignals(client, observedIds);
  const cohort = reconstructNewRejectCohort(baseSignals, runs);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = cohort.filter((record) => blindIds.has(record.signal.id)).length;
  assert.equal(blindOverlap, 0, "15.9I must prove zero Blind overlap before canonical URL/body reads");

  const urlFieldsById = await loadUrlFields(client, cohort.map((record) => record.signal.id));
  const withOrigin = addOrigin(cohort, urlFieldsById);
  const originCounts = {
    naver_blog: withOrigin.filter((record) => record.origin.kind === "naver_blog").length,
    external_web: withOrigin.filter((record) => record.origin.kind === "external_web").length,
  };
  assert.deepEqual(originCounts, { naver_blog: EXPECTED_NAVER, external_web: EXPECTED_EXTERNAL },
    "15.9I must preserve Phase 15.9E origin authority");

  const sample = selectPhase15_9FExternalPilot(withOrigin);
  assert.equal(fingerprint(sample.map((record) => record.signal.external_content_id)), PHASE15_9I_SAMPLE_FINGERPRINT,
    "15.9I must reconstruct the exact Phase 15.9G/H deterministic sample");
  const targets = selectPhase15_9ICandidateTargets(sample);
  assert.equal(targets.length, PHASE15_9I_TARGET_COUNT);
  assert.equal(new Set(targets.map((record) => record.signal.id)).size, PHASE15_9I_TARGET_COUNT);
  assert.equal(targets.every((record) => !blindIds.has(record.signal.id)), true);
  assert.equal(await countTargetOutcomeRows(client, targets.map((record) => record.signal.id)), 0,
    "15.9I confirmed false-negative Sources must not already have durable full-context outcomes");

  let sourceNetworkRequests = 0;
  const countedSourceFetch = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS,
      "15.9I exceeded source network request budget");
    return fetch(...args);
  };

  const safeRows = [];
  const safeArtifactTargets = [];
  for (const record of targets) {
    const authority = record.h_authority;
    assert.ok(authority);
    assert.equal(record.origin.kind, "external_web", "15.9I target content origin must remain external_web");
    assert.equal(record.admission.reason_codes[0], authority.rejection_stratum,
      "15.9I original rejection stratum drifted from Phase 15.9H authority");

    const first = await fetchSourceFullContext(record.signal, {
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      fetchImpl: countedSourceFetch,
      timeoutMs: 12_000,
    });
    const second = await fetchSourceFullContext(record.signal, {
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      fetchImpl: countedSourceFetch,
      timeoutMs: 12_000,
    });
    assertContextMatchesHAuthority(first, second, authority);

    const semanticCheck = resolveFullContextSemantic(authority.semantic);
    assert.equal(semanticCheck.decision, "candidate", "frozen H semantic facts must still resolve to Candidate");
    assert.deepEqual(semanticCheck.reason_codes, ["full_context_first_hand_external_friction"]);

    const frozenResult = buildPhase15_9IFrozenCandidateResult(authority, first, { model: MODEL_NAME });
    const row = buildSourceFullContextOutcomeRow({
      batchVersion: PHASE15_9I_BATCH_VERSION,
      sourceSignalId: record.signal.id,
      result: frozenResult,
      configuredModel: MODEL_NAME,
    });
    assert.equal(row.decision, "candidate");
    assert.equal(row.status, "resolved");
    assert.equal(row.context_content_sha256, authority.context_hash);
    assert.equal(row.context_char_count, authority.context_chars);
    safeRows.push(row);
    safeArtifactTargets.push({
      baseline_ordinal: record.baseline_ordinal,
      rejection_stratum: authority.rejection_stratum,
      context_hash: authority.context_hash,
      context_chars: authority.context_chars,
      extraction_scope: authority.extraction_scope,
      title_sha256: authority.title_sha256,
      semantic: authority.semantic,
      decision: "candidate",
      reason_codes: ["full_context_first_hand_external_friction"],
      recovery: authority.recovery,
    });
  }

  assert.equal(safeRows.length, PHASE15_9I_TARGET_COUNT, "all three H Candidate outcomes must be built before persistence");
  assert.equal(await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE), outcomeTotalBefore,
    "15.9I must not persist any outcome until all three rows pass context-integrity checks");
  assert.equal(await countBatchRows(client), 0, "15.9I batch must remain empty until the final bulk insert");
  assert.deepEqual(await snapshotProtectedDomains(client), protectedBefore,
    "15.9I reconstruction/refetch must not mutate protected domains before persistence");

  const persisted = await persistSourceFullContextOutcomeRows({
    client,
    rows: safeRows,
    expectedBatchVersion: PHASE15_9I_BATCH_VERSION,
    expectedCount: PHASE15_9I_TARGET_COUNT,
  });
  assert.equal(persisted.length, PHASE15_9I_TARGET_COUNT);

  const readback = await loadBatchReadback(client);
  assert.equal(readback.length, PHASE15_9I_TARGET_COUNT, "15.9I readback must contain exactly three rows");
  assert.equal(new Set(readback.map((row) => row.source_signal_id)).size, PHASE15_9I_TARGET_COUNT);
  assert.equal(readback.every((row) => row.status === "resolved" && row.decision === "candidate"), true);
  assert.equal(readback.every((row) => row.reason_codes?.[0] === "full_context_first_hand_external_friction"), true);
  assert.deepEqual(new Set(readback.map((row) => row.source_signal_id)), new Set(targets.map((record) => record.signal.id)));

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9I may mutate only the full-context outcome table");
  const outcomeTotalAfter = await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);
  assert.equal(outcomeTotalAfter, EXPECTED_OUTCOME_TOTAL_AFTER, "15.9I must increase durable outcomes by exactly three rows");
  assert.equal(await countBatchRows(client), PHASE15_9I_TARGET_COUNT);

  const artifact = {
    phase: "15.9I",
    version: PHASE15_9I_VERSION,
    authority: "integrity_bound_persistence_of_phase15.9h_confirmed_false_negative_candidates_only",
    baseline_phase: "15.9H",
    batch_version: PHASE15_9I_BATCH_VERSION,
    sample_fingerprint: PHASE15_9I_SAMPLE_FINGERPRINT,
    reconstructed_reject_cohort: cohort.length,
    blind_overlap_before_url_read: blindOverlap,
    origin_authority: originCounts,
    target_ordinals: PHASE15_9I_TARGET_ORDINALS,
    target_count: PHASE15_9I_TARGET_COUNT,
    context_integrity_verified: true,
    source_network_requests: sourceNetworkRequests,
    max_source_network_requests: PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS,
    model_calls: PHASE15_9I_MODEL_CALLS,
    database_write_statements: 1,
    outcome_rows_before: outcomeTotalBefore,
    outcome_rows_inserted: PHASE15_9I_TARGET_COUNT,
    outcome_rows_after: outcomeTotalAfter,
    protected_before: protectedBefore,
    protected_after: protectedAfter,
    source_admission_mutation_authorized: false,
    source_admission_policy_mutation_authorized: false,
    incident_creation_authorized: false,
    source_incident_link_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
    raw_source_body_persisted: false,
    candidate_targets: safeArtifactTargets,
  };
  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    phase: artifact.phase,
    batch_version: artifact.batch_version,
    target_count: artifact.target_count,
    context_integrity_verified: artifact.context_integrity_verified,
    model_calls: artifact.model_calls,
    source_network_requests: artifact.source_network_requests,
    database_write_statements: artifact.database_write_statements,
    outcome_rows_before: artifact.outcome_rows_before,
    outcome_rows_inserted: artifact.outcome_rows_inserted,
    outcome_rows_after: artifact.outcome_rows_after,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[phase15.9i] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
