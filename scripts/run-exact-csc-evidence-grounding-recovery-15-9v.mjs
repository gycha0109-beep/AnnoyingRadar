import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import {
  SOURCE_FORMATION_EVIDENCE_GROUNDING_RECOVERY_VERSION,
  resolveFormationWithEvidenceGroundingRecovery,
} from "../lib/sources/source-formation-evidence-grounding-recovery.mjs";
import {
  SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
  SOURCE_FORMATION_ASSESSMENT_TABLE,
  persistSourceFormationAssessment,
} from "../lib/sources/source-formation-assessment-persistence.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9V";
const VERSION = "phase15.9v-exact-csc-evidence-grounding-recovery-v0.1";
const ASSESSMENT_BATCH_VERSION = "phase15.9v-exact-csc-evidence-grounding-recovery-v0.1";
const BASELINE_FORMATION_BATCH_VERSION = "phase15.9u-exact-csc-second-formation-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c";
const TARGET_SOURCE_CONTENT_SHA256 = "db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4";
const TARGET_OUTCOME_BATCH_VERSION = "phase15.9t-exact-csc-outcome-v0.1";
const EXPECTED_CONTEXT_SHA256 = "751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540";
const EXPECTED_CONTEXT_CHAR_COUNT = 3035;
const EXPECTED_OUTCOME_TOTAL = 86;
const EXPECTED_FORMATION_TOTAL_BEFORE = 2;
const MAX_SOURCE_NETWORK_REQUESTS = 1;
const MAX_MODEL_CALLS = 2;

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9v-exact-csc-evidence-grounding-recovery.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countWhere(client, table, column, value) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq(column, value);
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
    ["full_context_outcomes", SOURCE_FULL_CONTEXT_OUTCOME_TABLE],
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadExactTarget(client) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9V exact Source hash pair must resolve uniquely");
  return data[0];
}

async function loadExactOutcome(client, signalId) {
  const { data, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("id, outcome_schema_version, batch_version, source_signal_id, status, decision, reason_codes, context_status, context_scope, context_content_sha256, context_char_count, context_truncated")
    .eq("source_signal_id", signalId)
    .eq("batch_version", TARGET_OUTCOME_BATCH_VERSION)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9V exact 15.9T durable outcome must resolve uniquely");
  const outcome = data[0];
  assert.equal(outcome.status, "resolved");
  assert.equal(outcome.decision, "candidate");
  assert.equal(outcome.context_status, "resolved");
  assert.equal(outcome.context_scope, "full_post");
  assert.equal(outcome.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(outcome.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(outcome.context_truncated, false);
  return outcome;
}

async function loadExactBaselineFormation(client, signalId, outcomeId) {
  const { data, error } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, assessment_batch_version, source_signal_id, source_admission_outcome_id, status, formation_state, resolved, reason_codes, problem_claim, experience_actor, friction_specificity, pain_centrality, content_kind, source_origin, friction_responsibility, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_grounded, context_content_sha256, context_char_count, context_truncated, recovery_attempted, recovery_recovered, recovery_attempt_count, recovery_trigger_reason_code")
    .eq("source_signal_id", signalId)
    .eq("assessment_batch_version", BASELINE_FORMATION_BATCH_VERSION)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9V requires exactly one durable 15.9U baseline Formation");
  const row = data[0];
  assert.equal(row.source_admission_outcome_id, outcomeId, "15.9V baseline must bind the exact 15.9T outcome");
  assert.equal(row.status, "unresolved");
  assert.equal(row.formation_state, "review");
  assert.equal(row.resolved, false);
  assert.deepEqual(row.reason_codes, ["source_formation_invalid_evidence_quote"]);
  for (const field of ["problem_claim", "experience_actor", "friction_specificity", "pain_centrality", "content_kind", "source_origin", "friction_responsibility"]) {
    assert.equal(row[field], null, `15.9V baseline ${field} must remain unpersisted`);
  }
  assert.equal(row.evidence_quote_sha256, null);
  assert.equal(row.evidence_quote_char_count, 0);
  assert.equal(row.evidence_quote_grounded, false);
  assert.equal(row.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(row.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(row.context_truncated, false);
  assert.equal(row.recovery_attempted, true);
  assert.equal(row.recovery_recovered, false);
  assert.equal(row.recovery_attempt_count, 2);
  assert.equal(row.recovery_trigger_reason_code, "source_formation_provider_incomplete");
  return row;
}

async function loadRecoveryReadback(client, signalId) {
  const { data, error } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, assessment_schema_version, assessment_batch_version, source_signal_id, source_admission_outcome_id, source_admission_batch_version, observer_version, status, formation_state, resolved, reason_codes, problem_claim, experience_actor, friction_specificity, pain_centrality, content_kind, source_origin, friction_responsibility, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_start, evidence_quote_end, evidence_quote_grounded, context_content_sha256, context_char_count, context_truncated, prompt_version, provider, model_name, recovery_attempted, recovery_recovered, recovery_attempt_count")
    .eq("assessment_batch_version", ASSESSMENT_BATCH_VERSION)
    .eq("source_signal_id", signalId)
    .limit(2);
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: VERSION,
      baseline_formation_batch_version: BASELINE_FORMATION_BATCH_VERSION,
      assessment_batch_version: ASSESSMENT_BATCH_VERSION,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls_max: MAX_MODEL_CALLS,
      expected_database_write_statements: 1,
      incident_persistence_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9V_EVIDENCE_GROUNDING_RECOVERY, "true",
    "15.9V live recovery requires explicit technical opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  const formationBefore = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(protectedBefore.full_context_outcomes, EXPECTED_OUTCOME_TOTAL, "15.9V requires the closed 86-outcome baseline");
  assert.equal(formationBefore, EXPECTED_FORMATION_TOTAL_BEFORE, "15.9V requires the closed two-Formation baseline");
  assert.equal(await countWhere(client, SOURCE_FORMATION_ASSESSMENT_TABLE, "assessment_batch_version", ASSESSMENT_BATCH_VERSION), 0,
    "15.9V batch already exists; rerun is forbidden");

  const target = await loadExactTarget(client);
  const exactOutcome = await loadExactOutcome(client, target.id);
  await loadExactBaselineFormation(client, target.id, exactOutcome.id);
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "source_signal_id", target.id), 1,
    "15.9V refuses ambiguous durable Source Admission authority");
  assert.equal(await countWhere(client, SOURCE_FORMATION_ASSESSMENT_TABLE, "source_signal_id", target.id), 1,
    "15.9V requires exactly the single 15.9U baseline Formation and no other Formation row");
  assert.equal(await countWhere(client, "ar_source_incident_links", "source_signal_id", target.id), 0,
    "15.9V target must remain unassigned to Incident");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "source_signal_id", target.id), 0,
    "15.9V target must remain absent from Public Evidence");
  const blindIds = await getEvaluationSampleIds(client);
  assert.equal(blindIds.has(target.id), false, "15.9V target must remain outside Blind evaluation");

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9V model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9V source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const result = await resolveFormationWithEvidenceGroundingRecovery(target, exactOutcome, {
    env: process.env,
    fetchImpl: countedFetch,
  });
  assert.equal(result.version, SOURCE_FORMATION_EVIDENCE_GROUNDING_RECOVERY_VERSION);
  assert.equal(result.full_context?.content_hash, EXPECTED_CONTEXT_SHA256);
  assert.equal(result.full_context?.content_text?.length, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(result.full_context?.truncated, false);
  if (result.semantic?.evidence_quote) {
    assert.equal(result.full_context.content_text.includes(result.semantic.evidence_quote), true,
      "15.9V may persist only an exact grounded evidence quote");
  }

  const persisted = await persistSourceFormationAssessment({
    client,
    assessmentBatchVersion: ASSESSMENT_BATCH_VERSION,
    sourceSignalId: target.id,
    sourceAdmissionOutcome: exactOutcome,
    result,
    configuredModel: result.configured_model,
  });
  assert.equal(persisted.source_admission_outcome_id, exactOutcome.id,
    "15.9V recovered Formation must bind the exact 15.9T outcome");
  assert.equal(persisted.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(persisted.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);

  const formationAfter = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(formationAfter, formationBefore + 1, "15.9V must append exactly one Formation assessment");
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9V may mutate only the Formation assessment table");

  const readback = await loadRecoveryReadback(client, target.id);
  assert.equal(readback.length, 1, "15.9V recovery batch readback must contain exactly one row");
  const row = readback[0];
  assert.equal(row.assessment_schema_version, SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION);
  assert.equal(row.observer_version, SOURCE_FORMATION_EVIDENCE_GROUNDING_RECOVERY_VERSION);
  assert.equal(row.source_admission_outcome_id, exactOutcome.id);
  assert.equal(row.source_admission_batch_version, TARGET_OUTCOME_BATCH_VERSION);
  assert.equal(row.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(row.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(row.context_truncated, false);
  if (row.resolved) {
    assert.equal(row.evidence_quote_grounded, true, "resolved 15.9V Formation must carry grounded evidence");
    assert.ok(row.evidence_quote_char_count > 0);
    assert.ok(row.evidence_quote_start >= 0);
    assert.ok(row.evidence_quote_end > row.evidence_quote_start);
  }
  assert.equal(row.recovery_attempted, false,
    "15.9V grounding recovery is phase-level authority, not the legacy provider-incomplete recovery field");

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "exact_invalid_quote_grounding_recovery_not_incident_authority",
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    target_outcome_batch_version: TARGET_OUTCOME_BATCH_VERSION,
    baseline_formation_batch_version: BASELINE_FORMATION_BATCH_VERSION,
    assessment_batch_version: ASSESSMENT_BATCH_VERSION,
    grounding_recovery: {
      semantic_observed: Boolean(result.grounding_recovery?.semantic_observed),
      evidence_selection_attempted: Boolean(result.grounding_recovery?.evidence_selection_attempted),
      evidence_selection_succeeded: Boolean(result.grounding_recovery?.evidence_selection_succeeded),
      candidate_count: Number(result.grounding_recovery?.candidate_count ?? 0),
      evidence_selection_prompt_version: result.grounding_recovery?.evidence_selection_prompt_version ?? null,
    },
    persistence: {
      status: row.status,
      formation_state: row.formation_state,
      resolved: row.resolved,
      reason_codes: row.reason_codes,
      problem_claim: row.problem_claim,
      experience_actor: row.experience_actor,
      friction_specificity: row.friction_specificity,
      pain_centrality: row.pain_centrality,
      content_kind: row.content_kind,
      source_origin: row.source_origin,
      friction_responsibility: row.friction_responsibility,
      evidence_quote_sha256: row.evidence_quote_sha256,
      evidence_quote_char_count: row.evidence_quote_char_count,
      evidence_quote_grounded: row.evidence_quote_grounded,
      context_content_sha256: row.context_content_sha256,
      context_char_count: row.context_char_count,
      context_truncated: row.context_truncated,
      prompt_version: row.prompt_version,
      provider: row.provider,
      model_name: row.model_name,
    },
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: modelCalls,
      model_calls_max: MAX_MODEL_CALLS,
      database_write_statements: 1,
      formation_assessments_before: formationBefore,
      formation_assessments_after: formationAfter,
      protected_before: protectedBefore,
      protected_after: protectedAfter,
    },
    downstream_authority: {
      incident_persistence_authorized: false,
      source_incident_link_authorized: false,
      public_problem_authorized: false,
      public_evidence_persistence_authorized: false,
      publication_authorized: false,
    },
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of ["source_signal_id", "source_admission_outcome_id", "formation_id", "canonical_url", "author_handle", "raw_text", "content_text", "evidence_quote\"", "provider_request_id", "incident_id", "public_problem_id"]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9V artifact must not expose ${forbidden}`);
  }
  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "EXACT_EVIDENCE_GROUNDING_RECOVERY_PERSISTED",
    phase: PHASE,
    formation_state: row.formation_state,
    resolved: row.resolved,
    reason_codes: row.reason_codes,
    evidence_quote_grounded: row.evidence_quote_grounded,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_write_statements: 1,
    formation_assessments_before: formationBefore,
    formation_assessments_after: formationAfter,
    protected_domains_unchanged: true,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9V] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
