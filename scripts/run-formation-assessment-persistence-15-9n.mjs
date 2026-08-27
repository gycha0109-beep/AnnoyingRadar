import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { selectPhase15_9KTargets } from "../lib/sources/phase15-9k-formation-provider-recovery.mjs";
import {
  PHASE15_9J_SOURCE_BATCH_VERSION,
  validatePhase15_9JOutcomeAuthority,
} from "../lib/sources/phase15-9j-formation-audit.mjs";
import {
  SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
  SOURCE_FORMATION_ASSESSMENT_TABLE,
} from "../lib/sources/source-formation-assessment-persistence.mjs";
import { persistFormationAssessmentForCurator } from "../lib/sources/source-formation-persistence-service.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9N";
const TARGET_ORDINAL = 9;
const EXPECTED_FULL_CONTEXT_OUTCOMES = 85;
const EXPECTED_FORMATION_ASSESSMENTS_BEFORE = 0;
const ASSESSMENT_BATCH_VERSION = "phase15.9n-ordinal9-persistence-v0.1";
const MAX_SOURCE_NETWORK_REQUESTS = 8;
const MAX_MODEL_CALLS = 2;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9n-formation-assessment-persistence.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
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
    ["full_context_outcomes", SOURCE_FULL_CONTEXT_OUTCOME_TABLE],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadPhase15_9IOutcomes(client) {
  const { data, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("source_signal_id, status, decision, reason_codes, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind, context_status, context_scope, context_content_sha256, context_char_count, context_truncated")
    .eq("batch_version", PHASE15_9J_SOURCE_BATCH_VERSION)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

function safePersistedRow(row) {
  return {
    assessment_schema_version: row.assessment_schema_version,
    assessment_batch_version: row.assessment_batch_version,
    status: row.status,
    formation_state: row.formation_state,
    resolved: row.resolved,
    reason_codes: row.reason_codes,
    context_content_sha256: row.context_content_sha256,
    context_char_count: row.context_char_count,
    evidence_quote_sha256: row.evidence_quote_sha256,
    evidence_quote_char_count: row.evidence_quote_char_count,
    evidence_quote_start: row.evidence_quote_start,
    evidence_quote_end: row.evidence_quote_end,
    recovery_attempted: row.recovery_attempted,
    recovery_recovered: row.recovery_recovered,
    recovery_attempt_count: row.recovery_attempt_count,
  };
}

function assertArtifactPrivacy(artifact) {
  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "source_admission_outcome_id",
    "canonical_url",
    "fetched_url",
    "content_text",
    "raw_text",
    "author_handle",
    "provider_request_id",
    "evidence_quote\"",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `15.9N artifact must not expose ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      schema_version: SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
      assessment_batch_version: ASSESSMENT_BATCH_VERSION,
      target_ordinal: TARGET_ORDINAL,
      expected_database_write_statements: 1,
      max_source_network_requests: MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: MAX_MODEL_CALLS,
      incident_authority_granted: false,
      publication_authority_granted: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9N_FORMATION_ASSESSMENT_PERSISTENCE, "true",
    "Live 15.9N requires explicit Formation persistence opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  const formationBefore = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(protectedBefore.full_context_outcomes, EXPECTED_FULL_CONTEXT_OUTCOMES,
    "15.9N requires the closed 85-row Source Admission outcome baseline");
  assert.equal(formationBefore, EXPECTED_FORMATION_ASSESSMENTS_BEFORE,
    "15.9N requires an empty Formation assessment table before its first controlled write");

  const durableRows = await loadPhase15_9IOutcomes(client);
  const validatedTargets = validatePhase15_9JOutcomeAuthority(durableRows);
  const target = selectPhase15_9KTargets(validatedTargets)
    .find((item) => item.baseline_ordinal === TARGET_ORDINAL);
  assert.ok(target, "15.9N target ordinal is missing from frozen Candidate authority");

  const blindIds = await getEvaluationSampleIds(client);
  assert.equal(blindIds.has(target.source_signal_id), false,
    "15.9N must prove the target is outside Blind before URL/body access");

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9N model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9N source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const result = await persistFormationAssessmentForCurator(client, {
    signalId: target.source_signal_id,
    assessmentBatchVersion: ASSESSMENT_BATCH_VERSION,
    env: process.env,
    fetchImpl: countedFetch,
  });

  assert.equal(result.authority, "durable_formation_assessment_not_incident_authority");
  assert.equal(result.persisted.assessment_schema_version, SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION);
  assert.equal(result.persisted.assessment_batch_version, ASSESSMENT_BATCH_VERSION);
  assert.equal(result.persisted.context_content_sha256, target.h_authority.context_hash);
  assert.equal(result.persisted.context_char_count, target.h_authority.context_chars);
  assert.equal(result.downstream_authority.incident_identity_assigned, false);
  assert.equal(result.downstream_authority.public_evidence_created, false);

  const formationAfter = await countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE);
  assert.equal(formationAfter, formationBefore + 1, "15.9N must append exactly one Formation assessment row");
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9N must not mutate protected Source/Incident/Public domains");

  const { data: readback, error: readbackError } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, assessment_schema_version, assessment_batch_version, source_signal_id, source_admission_outcome_id, status, formation_state, resolved, reason_codes, context_content_sha256, context_char_count, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_start, evidence_quote_end, recovery_attempted, recovery_recovered, recovery_attempt_count")
    .eq("assessment_batch_version", ASSESSMENT_BATCH_VERSION)
    .eq("source_signal_id", target.source_signal_id)
    .single();
  if (readbackError) throw readbackError;
  assert.equal(readback.id, result.persisted.id);

  const artifact = {
    phase: PHASE,
    schema_version: SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
    authority: "controlled_durable_formation_assessment_persistence_not_incident_authority",
    target: {
      baseline_ordinal: TARGET_ORDINAL,
      blind_member: false,
    },
    persistence: safePersistedRow(readback),
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
      problem_signature_authorized: false,
      public_evidence_persistence_authorized: false,
      canonical_problem_authorized: false,
      publication_authorized: false,
    },
  };
  assertArtifactPrivacy(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_PERSISTENCE_COMPLETE",
    phase: PHASE,
    target_ordinal: TARGET_ORDINAL,
    formation_state: readback.formation_state,
    resolved: readback.resolved,
    reason_codes: readback.reason_codes,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_write_statements: 1,
    formation_assessments_before: formationBefore,
    formation_assessments_after: formationAfter,
    protected_domains_unchanged: true,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9N] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
