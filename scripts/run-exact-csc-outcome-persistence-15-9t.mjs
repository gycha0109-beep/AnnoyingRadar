import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_DISPATCH_VERSION,
  SOURCE_FULL_CONTEXT_FETCH_VERSION,
} from "../lib/sources/source-full-context-fetch.mjs";
import {
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
  resolveFullContextSemantic,
} from "../lib/sources/source-full-context-resolution.mjs";
import { resolveSignalSourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  buildSourceFullContextOutcomeRow,
  SOURCE_FULL_CONTEXT_OUTCOME_TABLE,
} from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { persistSourceFullContextOutcomeRows } from "../lib/sources/source-full-context-outcome-batch.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9T";
const VERSION = "phase15.9t-exact-csc-outcome-persistence-v0.1";
const BATCH_VERSION = "phase15.9t-exact-csc-outcome-v0.1";
const PHASE15_9S_ARTIFACT_SHA256 = "afe8baf0624f44b58101544e211aba5b5243e507a355f49b30ffdeb05a7c0be5";
const TARGET_SOURCE_IDENTITY_SHA256 = "b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c";
const TARGET_SOURCE_CONTENT_SHA256 = "db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4";
const EXPECTED_CONTEXT_SHA256 = "751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540";
const EXPECTED_CONTEXT_CHAR_COUNT = 3035;
const EXPECTED_EXTRACTION_SCOPE = "naver_post_body";
const EXPECTED_EVIDENCE_QUOTE_SHA256 = "159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9";
const EXPECTED_EVIDENCE_QUOTE_CHAR_COUNT = 44;
const PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const MODEL_NAME = "gpt-5-mini-2025-08-07";
const MAX_NETWORK_REQUESTS = 1;

const FROZEN_SEMANTIC = Object.freeze({
  problem_claim: "yes",
  experience_actor: "self",
  friction_cause: "external_service_or_product",
  friction_specificity: "concrete",
  pain_centrality: "central",
  content_kind: "organic",
  prompt_version: "source-full-context-semantic-v0.1",
  provider: "openai",
  model: MODEL_NAME,
});

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9t-exact-csc-outcome-persistence.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countWhere(client, table, column, value) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
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
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["formation_assessments", "ar_source_formation_assessments"],
    ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
  ];
  const values = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, values[index]]));
}

async function loadExactTarget(client) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, source_origin_kind, source_origin_host, source_origin_classifier_version, first_seen_at, last_seen_at")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9T target Source identity/content hash must resolve uniquely");
  return data[0];
}

async function assertTargetAuthority(client, signal) {
  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "review", "15.9T target must remain REVIEW under snippet Admission authority");
  assert.equal(admission.requires_full_context, true, "15.9T target must still require full context at snippet authority");

  const origin = resolveSignalSourceOrigin(signal);
  assert.equal(origin?.kind, "naver_blog", "15.9T target must remain a Naver Blog Source");
  assert.equal(signal.content_scope, "search_snippet", "15.9T must start from the exact search-snippet Source");

  assert.equal(
    await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "source_signal_id", signal.id),
    0,
    "15.9T forbids any pre-existing durable full-context outcome for the target Source",
  );
  assert.equal(
    await countWhere(client, "ar_source_incident_links", "source_signal_id", signal.id),
    0,
    "15.9T target must remain outside Incident lineage",
  );
  assert.equal(
    await countWhere(client, "ar_public_problem_evidence_snapshots", "source_signal_id", signal.id),
    0,
    "15.9T target must remain outside Public Evidence",
  );
  assert.equal(
    await countWhere(client, "ar_source_signal_evaluation_samples", "source_signal_id", signal.id),
    0,
    "15.9T target must remain outside Blind evaluation",
  );

  const { data: incidents, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key, created_from_curator_decision_id")
    .eq("incident_key", PROTECTED_INCIDENT_KEY)
    .limit(2);
  if (error) throw error;
  assert.equal(incidents?.length, 1, "15.9T requires exactly one protected CSC Incident");

  return { admission, origin };
}

function assertContextAuthority(fullContext) {
  assert.equal(fullContext?.status, "resolved", "15.9T requires resolved full context");
  assert.equal(fullContext?.version, SOURCE_FULL_CONTEXT_FETCH_VERSION, "15.9T fetch version drifted from current authority");
  assert.equal(fullContext?.dispatch_version, SOURCE_FULL_CONTEXT_DISPATCH_VERSION, "15.9T dispatch version drifted from current authority");
  assert.equal(fullContext?.content_scope, "full_post", "15.9T requires full_post scope");
  assert.equal(fullContext?.extraction_scope, EXPECTED_EXTRACTION_SCOPE, "15.9T extraction scope drifted from Phase 15.9S");
  assert.equal(fullContext?.content_hash, EXPECTED_CONTEXT_SHA256, "15.9T full-context hash drifted from Phase 15.9S");
  assert.equal(fullContext?.original_char_count, EXPECTED_CONTEXT_CHAR_COUNT, "15.9T full-context length drifted from Phase 15.9S");
  assert.equal(fullContext?.content_text?.length, EXPECTED_CONTEXT_CHAR_COUNT, "15.9T fetched content length must match Phase 15.9S");
  assert.equal(fullContext?.truncated, false, "15.9T refuses truncated full context");
}

function buildFrozenCandidateResult(fullContext) {
  const semanticDecision = resolveFullContextSemantic(FROZEN_SEMANTIC);
  assert.equal(semanticDecision.decision, "candidate", "15.9T frozen Phase 15.9S semantic facts must still resolve to Candidate");
  assert.deepEqual(semanticDecision.reason_codes, ["full_context_first_hand_external_friction"]);

  return {
    version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: "resolved",
    decision: "candidate",
    resolved: true,
    reason_codes: ["full_context_first_hand_external_friction"],
    full_context: fullContext,
    semantic: { ...FROZEN_SEMANTIC },
  };
}

async function loadBatchReadback(client) {
  const { data, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("source_signal_id, batch_version, resolution_version, status, decision, reason_codes, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind, context_status, context_scope, context_content_sha256, context_char_count, context_truncated, prompt_version, provider, model_name, recovery_attempted, recovery_recovered, recovery_attempt_count")
    .eq("batch_version", BATCH_VERSION)
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
      baseline_phase: "15.9S",
      source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
      source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
      phase15_9s_artifact_sha256: PHASE15_9S_ARTIFACT_SHA256,
      batch_version: BATCH_VERSION,
      target_count: 1,
      model_calls: 0,
      max_network_requests: MAX_NETWORK_REQUESTS,
      database_write_statements_max: 1,
      durable_outcome_rows_max: 1,
      formation_persistence_authorized: false,
      incident_mutation_authorized: false,
      public_problem_mutation_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_PHASE15_9T_EXACT_OUTCOME_PERSISTENCE,
    "true",
    "Phase 15.9T live persistence requires explicit opt-in",
  );

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  const outcomeTotalBefore = await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);
  assert.equal(
    await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "batch_version", BATCH_VERSION),
    0,
    "15.9T batch already exists; live rerun is forbidden",
  );

  const signal = await loadExactTarget(client);
  const authority = await assertTargetAuthority(client, signal);

  let networkRequests = 0;
  const countedFetch = async (...args) => {
    networkRequests += 1;
    assert.ok(networkRequests <= MAX_NETWORK_REQUESTS, "15.9T exceeded the one-refetch network budget");
    return fetch(...args);
  };

  const fullContext = await fetchSourceFullContext(signal, { fetchImpl: countedFetch });
  assertContextAuthority(fullContext);

  const frozenResult = buildFrozenCandidateResult(fullContext);
  const row = buildSourceFullContextOutcomeRow({
    batchVersion: BATCH_VERSION,
    sourceSignalId: signal.id,
    result: frozenResult,
    configuredModel: MODEL_NAME,
  });

  assert.equal(row.status, "resolved");
  assert.equal(row.decision, "candidate");
  assert.equal(row.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(row.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(row.context_truncated, false);
  assert.equal(row.prompt_version, FROZEN_SEMANTIC.prompt_version);
  assert.equal(row.provider, FROZEN_SEMANTIC.provider);
  assert.equal(row.model_name, MODEL_NAME);

  assert.equal(await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE), outcomeTotalBefore,
    "15.9T must not write before the exact row passes all integrity checks");
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "source_signal_id", signal.id), 0);
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "batch_version", BATCH_VERSION), 0);
  assert.deepEqual(await snapshotProtectedDomains(client), protectedBefore,
    "15.9T pre-persistence verification must not mutate protected domains");

  const persisted = await persistSourceFullContextOutcomeRows({
    client,
    rows: [row],
    expectedBatchVersion: BATCH_VERSION,
    expectedCount: 1,
  });
  assert.equal(persisted.length, 1, "15.9T must append exactly one durable outcome row");

  const readback = await loadBatchReadback(client);
  assert.equal(readback.length, 1, "15.9T batch readback must contain exactly one row");
  const durable = readback[0];
  assert.equal(durable.source_signal_id, signal.id);
  assert.equal(durable.batch_version, BATCH_VERSION);
  assert.equal(durable.resolution_version, SOURCE_FULL_CONTEXT_RESOLUTION_VERSION);
  assert.equal(durable.status, "resolved");
  assert.equal(durable.decision, "candidate");
  assert.deepEqual(durable.reason_codes, ["full_context_first_hand_external_friction"]);
  assert.equal(durable.problem_claim, FROZEN_SEMANTIC.problem_claim);
  assert.equal(durable.experience_actor, FROZEN_SEMANTIC.experience_actor);
  assert.equal(durable.friction_cause, FROZEN_SEMANTIC.friction_cause);
  assert.equal(durable.friction_specificity, FROZEN_SEMANTIC.friction_specificity);
  assert.equal(durable.pain_centrality, FROZEN_SEMANTIC.pain_centrality);
  assert.equal(durable.content_kind, FROZEN_SEMANTIC.content_kind);
  assert.equal(durable.context_status, "resolved");
  assert.equal(durable.context_scope, "full_post");
  assert.equal(durable.context_content_sha256, EXPECTED_CONTEXT_SHA256);
  assert.equal(durable.context_char_count, EXPECTED_CONTEXT_CHAR_COUNT);
  assert.equal(durable.context_truncated, false);
  assert.equal(durable.prompt_version, FROZEN_SEMANTIC.prompt_version);
  assert.equal(durable.provider, FROZEN_SEMANTIC.provider);
  assert.equal(durable.model_name, MODEL_NAME);
  assert.equal(durable.recovery_attempted, false);
  assert.equal(durable.recovery_recovered, false);
  assert.equal(durable.recovery_attempt_count, 1);

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9T may mutate only the full-context outcome table");
  const outcomeTotalAfter = await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);
  assert.equal(outcomeTotalAfter, outcomeTotalBefore + 1, "15.9T must increase durable outcomes by exactly one row");
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "source_signal_id", signal.id), 1);
  assert.equal(await countWhere(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "batch_version", BATCH_VERSION), 1);

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "integrity_bound_persistence_of_exact_phase15.9s_candidate_only",
    baseline_phase: "15.9S",
    phase15_9s_artifact_sha256: PHASE15_9S_ARTIFACT_SHA256,
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    admission_decision_before: authority.admission.decision,
    admission_reason_codes_before: authority.admission.reason_codes,
    source_origin_kind: authority.origin.kind,
    batch_version: BATCH_VERSION,
    context_integrity_verified: true,
    full_context: {
      fetch_version: SOURCE_FULL_CONTEXT_FETCH_VERSION,
      dispatch_version: SOURCE_FULL_CONTEXT_DISPATCH_VERSION,
      extraction_scope: EXPECTED_EXTRACTION_SCOPE,
      content_scope: "full_post",
      content_sha256: EXPECTED_CONTEXT_SHA256,
      original_char_count: EXPECTED_CONTEXT_CHAR_COUNT,
      truncated: false,
    },
    semantic: {
      ...FROZEN_SEMANTIC,
      evidence_quote_sha256: EXPECTED_EVIDENCE_QUOTE_SHA256,
      evidence_quote_char_count: EXPECTED_EVIDENCE_QUOTE_CHAR_COUNT,
      evidence_quote_grounded_in_phase15_9s: true,
    },
    status: "resolved",
    decision: "candidate",
    reason_codes: ["full_context_first_hand_external_friction"],
    model_calls: 0,
    network_requests: networkRequests,
    max_network_requests: MAX_NETWORK_REQUESTS,
    database_write_statements: 1,
    outcome_rows_before: outcomeTotalBefore,
    outcome_rows_inserted: 1,
    outcome_rows_after: outcomeTotalAfter,
    protected_before: protectedBefore,
    protected_after: protectedAfter,
    full_source_body_persisted: false,
    evidence_quote_persisted: false,
    formation_persistence_authorized: false,
    incident_mutation_authorized: false,
    source_incident_link_authorized: false,
    public_problem_mutation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "evidence_quote\"",
    "provider_request_id",
    "incident_id",
    "curator_decision_id",
    "public_problem_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9T artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "EXACT_DURABLE_OUTCOME_PERSISTED",
    phase: PHASE,
    version: VERSION,
    batch_version: BATCH_VERSION,
    decision: "candidate",
    context_integrity_verified: true,
    model_calls: 0,
    network_requests: networkRequests,
    database_write_statements: 1,
    outcome_rows_before: outcomeTotalBefore,
    outcome_rows_inserted: 1,
    outcome_rows_after: outcomeTotalAfter,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9T] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
