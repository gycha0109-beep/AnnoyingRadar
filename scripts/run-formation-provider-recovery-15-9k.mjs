import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { comparePhase15_9GFetches } from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";
import {
  createPhase15_9KBaselineFetch,
  createPhase15_9KRecoveryFetch,
  determinePhase15_9KConclusion,
  PHASE15_9K_BASE_MAX_OUTPUT_TOKENS,
  PHASE15_9K_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9K_MAX_MODEL_CALLS,
  PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
  PHASE15_9K_TARGET_COUNT,
  PHASE15_9K_TARGET_ORDINALS,
  PHASE15_9K_VERSION,
  runPhase15_9KFormationJudgeWithRecovery,
  safePhase15_9KSemantic,
  selectPhase15_9KTargets,
  summarizePhase15_9K,
} from "../lib/sources/phase15-9k-formation-provider-recovery.mjs";
import {
  inspectPhase15_9JContextIntegrity,
  PHASE15_9J_SOURCE_BATCH_VERSION,
  validatePhase15_9JOutcomeAuthority,
} from "../lib/sources/phase15-9j-formation-audit.mjs";
import { classifySourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "../lib/sources/source-full-context-fetch.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import {
  getSourceProblemFormationProviderConfig,
  judgeSourceProblemFormationSemantics,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
  SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
} from "../lib/sources/source-problem-formation-observer.mjs";
import { resolveProblemFormationSemantic } from "../lib/sources/source-problem-formation.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const TARGET_LOOKUP_LIMIT = 20;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9k-formation-provider-recovery.json";
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
    .limit(TARGET_LOOKUP_LIMIT);
  if (error) throw error;
  return data ?? [];
}

async function assertNoDownstreamAssignments(client, sourceIds) {
  const [{ data: links, error: linkError }, { data: evidence, error: evidenceError }] = await Promise.all([
    client.from("ar_source_incident_links").select("source_signal_id").in("source_signal_id", sourceIds).limit(TARGET_LOOKUP_LIMIT),
    client.from("ar_public_problem_evidence_snapshots").select("source_signal_id").in("source_signal_id", sourceIds).limit(TARGET_LOOKUP_LIMIT),
  ]);
  if (linkError) throw linkError;
  if (evidenceError) throw evidenceError;
  assert.equal((links ?? []).length, 0, "15.9K targets must remain outside Incident authority");
  assert.equal((evidence ?? []).length, 0, "15.9K targets must remain outside Public Evidence authority");
}

async function loadTargetSignals(client, sourceIds) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .in("id", sourceIds)
    .limit(TARGET_LOOKUP_LIMIT);
  if (error) throw error;
  assert.equal((data ?? []).length, PHASE15_9K_TARGET_COUNT, "every Phase 15.9K target Source must still exist");
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function contextDriftItem(target, integrity) {
  return {
    baseline_ordinal: target.baseline_ordinal,
    prior_rejection_stratum: target.h_authority.rejection_stratum,
    context_integrity_ok: false,
    context_failures: [...(integrity.failures ?? [])],
    baseline_resolved: false,
    formation_state: null,
    resolved: false,
    reason_codes: [integrity.stable_pair ? "phase15_9k_context_drift" : "phase15_9k_context_pair_unstable"],
    semantic: null,
    provider_attempts: [],
    recovery: {
      attempted: false,
      recovered: false,
      attempt_count: 0,
      trigger_reason_code: null,
      terminal_reason_code: null,
    },
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
    "evidence_quote\"",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `15.9K artifact must not expose ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9K",
      version: PHASE15_9K_VERSION,
      baseline_phase: "15.9J",
      target_ordinals: PHASE15_9K_TARGET_ORDINALS,
      target_count: PHASE15_9K_TARGET_COUNT,
      baseline_max_output_tokens: PHASE15_9K_BASE_MAX_OUTPUT_TOKENS,
      recovery_max_output_tokens: PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
      max_source_network_requests: PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: PHASE15_9K_MAX_MODEL_CALLS,
      retry_reason: "source_formation_provider_incomplete only",
      invalid_quote_retry_enabled: false,
      database_writes: 0,
      incident_authority_granted: false,
      publication_authority_granted: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9K_FORMATION_PROVIDER_RECOVERY, "true",
    "Live 15.9K requires explicit provider-recovery opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  assert.equal(protectedBefore.full_context_outcomes, PHASE15_9K_EXPECTED_OUTCOME_TOTAL,
    "15.9K requires the closed 85-row full-context outcome baseline");

  const durableRows = await loadPhase15_9IOutcomes(client);
  const validatedJTargets = validatePhase15_9JOutcomeAuthority(durableRows);
  const targets = selectPhase15_9KTargets(validatedJTargets);
  assert.deepEqual(targets.map((target) => target.baseline_ordinal), [...PHASE15_9K_TARGET_ORDINALS]);
  const targetIds = targets.map((target) => target.source_signal_id);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = targetIds.filter((id) => blindIds.has(id)).length;
  assert.equal(blindOverlap, 0, "15.9K must prove zero Blind overlap before canonical URL/body reads");
  await assertNoDownstreamAssignments(client, targetIds);

  const sourceById = await loadTargetSignals(client, targetIds);
  const provider = getSourceProblemFormationProviderConfig(process.env);
  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const results = [];

  const countedSourceFetch = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS, "15.9K source network budget exceeded");
    return globalThis.fetch(...args);
  };
  const countedModelFetch = async (...args) => {
    modelCalls += 1;
    assert.ok(modelCalls <= PHASE15_9K_MAX_MODEL_CALLS, "15.9K model-call budget exceeded");
    return globalThis.fetch(...args);
  };

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const source = sourceById.get(target.source_signal_id);
    assert.ok(source, "15.9K target Source lookup failed");
    const origin = classifySourceOrigin(source.canonical_url);
    assert.equal(origin?.kind, "external_web", "15.9K targets must retain external_web origin");

    const first = await fetchSourceFullContext(source, {
      fetchImpl: countedSourceFetch,
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
    });
    const second = await fetchSourceFullContext(source, {
      fetchImpl: countedSourceFetch,
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
    });
    const integrity = inspectPhase15_9JContextIntegrity(first, second, target, {
      compareFetches: comparePhase15_9GFetches,
    });
    if (!integrity.ok) {
      results.push(contextDriftItem(target, integrity));
      console.log(`[15.9K] ${index + 1}/${PHASE15_9K_TARGET_COUNT} ordinal=${target.baseline_ordinal} context_integrity=false model_calls=0`);
      continue;
    }

    const providerAttempts = [];
    const onProviderMetadata = (metadata) => providerAttempts.push({
      attempt: providerAttempts.length + 1,
      ...metadata,
    });
    const baselineFetch = createPhase15_9KBaselineFetch(countedModelFetch, { onProviderMetadata });
    const recoveryFetch = createPhase15_9KRecoveryFetch(countedModelFetch, { onProviderMetadata });
    const judge = (input, control = {}) => judgeSourceProblemFormationSemantics({
      ...input,
      ...provider,
      fetchImpl: control.recovery ? recoveryFetch : baselineFetch,
    });

    const judged = await runPhase15_9KFormationJudgeWithRecovery(judge, {
      title: first.title,
      fullText: first.content_text,
      sourcePlatform: origin.kind,
    });

    assert.ok(providerAttempts.length >= 1 && providerAttempts.length <= 2,
      "15.9K must record one or two provider attempts per integrity-stable target");
    assert.equal(providerAttempts[0].requested_max_output_tokens, PHASE15_9K_BASE_MAX_OUTPUT_TOKENS,
      "15.9K first attempt must preserve the existing Formation output budget");
    if (judged.recovery.attempted) {
      assert.equal(providerAttempts.length, 2);
      assert.equal(providerAttempts[1].requested_max_output_tokens, PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
        "15.9K recovery attempt must use the bounded enlarged output budget");
      assert.equal(judged.recovery.trigger_reason_code, "source_formation_provider_incomplete");
    }

    if (judged.error) {
      results.push({
        baseline_ordinal: target.baseline_ordinal,
        prior_rejection_stratum: target.h_authority.rejection_stratum,
        context_integrity_ok: true,
        context_failures: [],
        baseline_resolved: false,
        formation_state: "review",
        resolved: false,
        reason_codes: [typeof judged.error?.code === "string" ? judged.error.code : "source_formation_judge_failed"],
        semantic: null,
        provider_attempts: providerAttempts,
        recovery: judged.recovery,
      });
      console.log(`[15.9K] ${index + 1}/${PHASE15_9K_TARGET_COUNT} ordinal=${target.baseline_ordinal} unresolved=${judged.recovery.terminal_reason_code} recovery=${judged.recovery.attempted}`);
      continue;
    }

    const formation = resolveProblemFormationSemantic(judged.semantic, { fullText: first.content_text });
    results.push({
      baseline_ordinal: target.baseline_ordinal,
      prior_rejection_stratum: target.h_authority.rejection_stratum,
      context_integrity_ok: true,
      context_failures: [],
      baseline_resolved: !judged.recovery.attempted,
      formation_state: formation.formation_state,
      resolved: formation.resolved,
      reason_codes: [...formation.reason_codes],
      semantic: safePhase15_9KSemantic(judged.semantic, first.content_text),
      provider_attempts: providerAttempts,
      recovery: judged.recovery,
    });
    console.log(`[15.9K] ${index + 1}/${PHASE15_9K_TARGET_COUNT} ordinal=${target.baseline_ordinal} state=${formation.formation_state} resolved=${formation.resolved} recovery=${judged.recovery.attempted}/${judged.recovery.recovered}`);
  }

  assert.equal(results.length, PHASE15_9K_TARGET_COUNT);
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.9K must remain database read-only");
  const summary = summarizePhase15_9K(results);
  const conclusion = determinePhase15_9KConclusion(summary);

  const artifact = {
    phase: "15.9K",
    version: PHASE15_9K_VERSION,
    authority: "bounded_read_only_formation_provider_incomplete_recovery_reproduction_only",
    baseline: {
      phase: "15.9J",
      target_ordinals: PHASE15_9K_TARGET_ORDINALS,
      baseline_reason: "source_formation_provider_incomplete",
      baseline_attempts_per_target: 2,
      full_context_outcomes: PHASE15_9K_EXPECTED_OUTCOME_TOTAL,
      blind_overlap_before_url_body_read: blindOverlap,
    },
    recovery_policy: {
      prompt_version: SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
      observer_version: SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
      provider: "openai",
      model: provider.model,
      actual_source_platform_supplied: "external_web",
      baseline_max_output_tokens: PHASE15_9K_BASE_MAX_OUTPUT_TOKENS,
      recovery_max_output_tokens: PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
      retry_reason: "source_formation_provider_incomplete",
      invalid_quote_retry_enabled: false,
      max_attempts_per_source: 2,
    },
    summary,
    results,
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: modelCalls,
      model_calls_max: PHASE15_9K_MAX_MODEL_CALLS,
      database_writes: 0,
      protected_before: protectedBefore,
      protected_after: protectedAfter,
      protected_domains_unchanged: true,
    },
    downstream_authority: {
      incident_identity_assigned: false,
      incident_rows_written: 0,
      source_incident_links_written: 0,
      problem_signature_assigned: false,
      canonical_problem_authority_granted: false,
      public_evidence_written: 0,
      publication_authority_granted: false,
    },
    conclusion,
  };
  assertArtifactPrivacy(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_RECOVERY_REPRODUCTION_COMPLETE",
    phase: "15.9K",
    summary,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_writes: 0,
    protected_domains_unchanged: true,
    conclusion,
    output_path: outputPath,
    incident_authority_granted: false,
    publication_authority_granted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9K] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
