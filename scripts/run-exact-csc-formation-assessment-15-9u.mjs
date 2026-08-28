import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import {
  SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
  SOURCE_FORMATION_ASSESSMENT_TABLE,
} from "../lib/sources/source-formation-assessment-persistence.mjs";
import { persistFormationAssessmentForCurator } from "../lib/sources/source-formation-persistence-service.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9U";
const VERSION = "phase15.9u-exact-csc-formation-v0.1";
const ASSESSMENT_BATCH_VERSION = "phase15.9u-exact-csc-second-formation-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c";
const TARGET_SOURCE_CONTENT_SHA256 = "db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4";
const TARGET_OUTCOME_BATCH_VERSION = "phase15.9t-exact-csc-outcome-v0.1";
const EXPECTED_CONTEXT_SHA256 = "751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540";
const EXPECTED_CONTEXT_CHAR_COUNT = 3035;
const EXPECTED_OUTCOME_TOTAL = 86;
const EXPECTED_FORMATION_TOTAL_BEFORE = 1;
const MAX_SOURCE_NETWORK_REQUESTS = 1;
const MAX_MODEL_CALLS = 2;

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9u-exact-csc-formation.json";
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
    .select("id")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9U exact Source hash pair must resolve uniquely");
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
  assert.equal(data?.length, 1, "15.9U exact 15.9T durable outcome must resolve uniquely");
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

async function loadFormationReadback(client, signalId) {
  const { data, error } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, assessment_schema_version, assessment_batch_version, source_signal_id, source_admission_outcome_id, source_admission_batch_version, status, formation_state, resolved, reason_codes, problem_claim, experience_actor, friction_specificity, pain_centrality, content_kind, source_origin, friction_responsibility, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_grounded, context_content_sha256, context_char_count, context_truncated, prompt_version, provider, model_name, recovery_attempted, recovery_recovered, recovery_attempt_count")
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
      target_outcome_batch_version: TARGET_OUTCOME_BATCH_VERSION,
      assessment_batch_version: ASSESSMENT_BATCH_VERSION,
      expected_database_write_statements: 1,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls_max: MAX_MODEL_CALLS,
      incident_persistence_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9U_EXACT_FORMATION, "true", "15.9U live Formation requires explicit technical opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  const formationBefore = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(protectedBefore.full_context_outcomes, EXPECTED_OUTCOME_TOTAL, "15.9U requires the closed 86-outcome baseline");
  assert.equal(formationBefore, EXPECTED_FORMATION_TOTAL_BEFORE, "15.9U requires exactly one prior Formation assessment baseline");
  assert.equal(await countWhere(client, SOURCE_FORMATION_ASSESSMENT_TABLE, "assessment_batch_version", ASSESSMENT_BATCH_VERSION), 0,
    "15.9U batch already exists; rerun is forbidden");

  const target = await loadExactTarget(client);
  const exactOutcome = await loadExactOutcome(client, target.id);
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "source_signal_id", target.id), 1,
    "15.9U refuses ambiguous durable Source Admission authority");
  assert.equal(await countWhere(client, SOURCE_FORMATION_ASSESSMENT_TABLE, "source_signal_id", target.id), 0,
    "15.9U target must have no prior Formation assessment of any batch");
  assert.equal(await countWhere(client, "ar_source_incident_links", "source_signal_id", target.id), 0);
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "source_signal_id", target.id), 0);
  const blindIds = await getEvaluationSampleIds(client);
  assert.equal(blindIds.has(target.id), false, "15.9U target must remain outside Blind evaluation");

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9U model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9U source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const result = await persistFormationAssessmentForCurator(client, {
    signalId: target.id,
    assessmentBatchVersion: ASSESSMENT_BATCH_VERSION,
    env: process.env,
    fetchImpl: countedFetch,
  });
  assert.equal(result.authority, "durable_formation_assessment_not_incident_authority");
  assert.equal(result.persisted.source_admission_outcome_id, exactOutcome.id,
    "15.9U persisted Formation must bind the exact 15.9T outcome id");
  assert.equal(result.persisted.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(result.persisted.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(result.downstream_authority.incident_identity_assigned, false);
  assert.equal(result.downstream_authority.source_incident_link_created, false);
  assert.equal(result.downstream_authority.public_evidence_created, false);

  const formationAfter = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(formationAfter, formationBefore + 1, "15.9U must append exactly one Formation assessment");
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9U may mutate only the Formation assessment table");

  const readback = await loadFormationReadback(client, target.id);
  assert.equal(readback.length, 1, "15.9U exact batch readback must contain one row");
  const row = readback[0];
  assert.equal(row.assessment_schema_version, SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION);
  assert.equal(row.source_admission_outcome_id, exactOutcome.id);
  assert.equal(row.source_admission_batch_version, TARGET_OUTCOME_BATCH_VERSION);
  assert.equal(row.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(row.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(row.context_truncated, false);

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "exact_durable_formation_assessment_not_incident_authority",
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    target_outcome_batch_version: TARGET_OUTCOME_BATCH_VERSION,
    assessment_batch_version: ASSESSMENT_BATCH_VERSION,
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
      recovery_attempted: row.recovery_attempted,
      recovery_recovered: row.recovery_recovered,
      recovery_attempt_count: row.recovery_attempt_count,
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
  for (const forbidden of ["source_signal_id", "source_admission_outcome_id", "canonical_url", "author_handle", "raw_text", "content_text", "evidence_quote\"", "provider_request_id", "incident_id", "public_problem_id"]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9U artifact must not expose ${forbidden}`);
  }
  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "EXACT_FORMATION_PERSISTED",
    phase: PHASE,
    formation_state: row.formation_state,
    resolved: row.resolved,
    reason_codes: row.reason_codes,
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
  console.error(`[15.9U] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
