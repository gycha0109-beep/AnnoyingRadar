import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { selectPhase15_9KTargets } from "../lib/sources/phase15-9k-formation-provider-recovery.mjs";
import {
  PHASE15_9J_SOURCE_BATCH_VERSION,
  validatePhase15_9JOutcomeAuthority,
} from "../lib/sources/phase15-9j-formation-audit.mjs";
import {
  assessSourceFormationForCurator,
  SOURCE_FORMATION_ASSESSMENT_VERSION,
} from "../lib/sources/source-formation-service.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9M";
const TARGET_ORDINAL = 9;
const EXPECTED_FULL_CONTEXT_OUTCOMES = 85;
const MAX_SOURCE_NETWORK_REQUESTS = 8;
const MAX_MODEL_CALLS = 2;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9m-curator-formation-handoff.json";
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

function safeArtifactAssessment(assessment) {
  return {
    version: assessment.version,
    authority: assessment.authority,
    source_admission_authority: {
      outcome_schema_version: assessment.source_admission_authority.outcome_schema_version,
      batch_version: assessment.source_admission_authority.batch_version,
      status: assessment.source_admission_authority.status,
      decision: assessment.source_admission_authority.decision,
      reason_codes: assessment.source_admission_authority.reason_codes,
    },
    formation: assessment.formation,
    downstream_authority: assessment.downstream_authority,
  };
}

function assertArtifactPrivacy(artifact) {
  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "fetched_url",
    "content_text",
    "raw_text",
    "author_handle",
    "provider_request_id",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `15.9M artifact must not expose ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: SOURCE_FORMATION_ASSESSMENT_VERSION,
      target_ordinal: TARGET_ORDINAL,
      database_writes: 0,
      max_source_network_requests: MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: MAX_MODEL_CALLS,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9M_CURATOR_FORMATION_HANDOFF, "true",
    "Live 15.9M requires explicit handoff verification opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  assert.equal(protectedBefore.full_context_outcomes, EXPECTED_FULL_CONTEXT_OUTCOMES,
    "15.9M requires the closed 85-row full-context outcome baseline");

  const durableRows = await loadPhase15_9IOutcomes(client);
  const validatedTargets = validatePhase15_9JOutcomeAuthority(durableRows);
  const target = selectPhase15_9KTargets(validatedTargets)
    .find((item) => item.baseline_ordinal === TARGET_ORDINAL);
  assert.ok(target, "15.9M target ordinal is missing from frozen Candidate authority");

  const blindIds = await getEvaluationSampleIds(client);
  assert.equal(blindIds.has(target.source_signal_id), false,
    "15.9M must prove the target is outside Blind before service URL/body access");

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9M model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9M source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const assessment = await assessSourceFormationForCurator(client, {
    signalId: target.source_signal_id,
    env: process.env,
    fetchImpl: countedFetch,
  });

  assert.equal(assessment.version, SOURCE_FORMATION_ASSESSMENT_VERSION);
  assert.equal(assessment.source_admission_authority.status, "resolved");
  assert.equal(assessment.source_admission_authority.decision, "candidate");
  assert.equal(assessment.downstream_authority.incident_identity_assigned, false);
  assert.equal(assessment.downstream_authority.public_evidence_created, false);

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.9M must remain database read-only");

  const artifact = {
    phase: PHASE,
    version: SOURCE_FORMATION_ASSESSMENT_VERSION,
    authority: "live_read_only_curator_formation_handoff_verification",
    target: {
      baseline_ordinal: TARGET_ORDINAL,
      blind_member: false,
    },
    assessment: safeArtifactAssessment(assessment),
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: modelCalls,
      model_calls_max: MAX_MODEL_CALLS,
      database_writes: 0,
      protected_before: protectedBefore,
      protected_after: protectedAfter,
    },
    downstream_authority: {
      incident_persistence_authorized: false,
      public_evidence_persistence_authorized: false,
      canonical_problem_authorized: false,
      publication_authorized: false,
    },
  };
  assertArtifactPrivacy(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_VERIFICATION_COMPLETE",
    phase: PHASE,
    version: SOURCE_FORMATION_ASSESSMENT_VERSION,
    target_ordinal: TARGET_ORDINAL,
    formation_state: assessment.formation.formation_state,
    resolved: assessment.formation.resolved,
    reason_codes: assessment.formation.reason_codes,
    recovery: assessment.formation.recovery,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_write_statements: 0,
    protected_domains_unchanged: true,
    artifact_contains_source_id_or_body: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9M] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
