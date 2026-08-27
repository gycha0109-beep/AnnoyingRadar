import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { comparePhase15_9GFetches } from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";
import {
  assertPhase15_9LProviderAttemptContract,
  buildPhase15_9LArtifactItem,
  createPhase15_9LObservedProviderFetch,
  phase15_9LAuthorityManifest,
  PHASE15_9L_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9L_MAX_MODEL_CALLS,
  PHASE15_9L_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9L_TARGET_COUNT,
  PHASE15_9L_TARGET_ORDINALS,
  PHASE15_9L_VERSION,
  summarizePhase15_9L,
} from "../lib/sources/phase15-9l-formation-recovery-promotion.mjs";
import { selectPhase15_9KTargets } from "../lib/sources/phase15-9k-formation-provider-recovery.mjs";
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
  resolveSourceProblemFormationAudit,
} from "../lib/sources/source-problem-formation-observer.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const TARGET_LOOKUP_LIMIT = 20;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9l-formation-recovery-promotion.json";
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
  assert.equal((links ?? []).length, 0, "15.9L targets must remain outside Incident authority");
  assert.equal((evidence ?? []).length, 0, "15.9L targets must remain outside Public Evidence authority");
}

async function loadTargetSignals(client, sourceIds) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .in("id", sourceIds)
    .limit(TARGET_LOOKUP_LIMIT);
  if (error) throw error;
  assert.equal((data ?? []).length, PHASE15_9L_TARGET_COUNT, "every Phase 15.9L target Source must still exist");
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function contextDriftItem(target, integrity) {
  return {
    baseline_ordinal: target.baseline_ordinal,
    prior_rejection_stratum: target.h_authority.rejection_stratum,
    context_integrity_ok: false,
    context_failures: [...(integrity.failures ?? [])],
    formation_state: "review",
    resolved: false,
    reason_codes: [integrity.stable_pair ? "phase15_9l_context_drift" : "phase15_9l_context_pair_unstable"],
    semantic: null,
    recovery: {
      version: null,
      attempted: false,
      recovered: false,
      attempt_count: 0,
      trigger_reason_code: null,
      base_max_output_tokens: null,
      recovery_max_output_tokens: null,
    },
    provider_attempts: [],
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
    assert.equal(serialized.includes(forbidden), false, `15.9L artifact must not expose ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const authority = phase15_9LAuthorityManifest();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9L",
      version: PHASE15_9L_VERSION,
      target_ordinals: PHASE15_9L_TARGET_ORDINALS,
      target_count: PHASE15_9L_TARGET_COUNT,
      authority,
      max_source_network_requests: PHASE15_9L_MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: PHASE15_9L_MAX_MODEL_CALLS,
      database_writes: 0,
      incident_authority_granted: false,
      publication_authority_granted: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9L_FORMATION_RECOVERY_PROMOTION, "true",
    "Live 15.9L requires explicit recovery-promotion verification opt-in");

  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  assert.equal(protectedBefore.full_context_outcomes, PHASE15_9L_EXPECTED_OUTCOME_TOTAL,
    "15.9L requires the closed 85-row full-context outcome baseline");

  const durableRows = await loadPhase15_9IOutcomes(client);
  const validatedJTargets = validatePhase15_9JOutcomeAuthority(durableRows);
  const targets = selectPhase15_9KTargets(validatedJTargets);
  assert.deepEqual(targets.map((target) => target.baseline_ordinal), [...PHASE15_9L_TARGET_ORDINALS]);
  const targetIds = targets.map((target) => target.source_signal_id);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = targetIds.filter((id) => blindIds.has(id)).length;
  assert.equal(blindOverlap, 0, "15.9L must prove zero Blind overlap before canonical URL/body reads");
  await assertNoDownstreamAssignments(client, targetIds);

  const sourceById = await loadTargetSignals(client, targetIds);
  const provider = getSourceProblemFormationProviderConfig(process.env);
  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const items = [];

  const countedSourceFetch = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= PHASE15_9L_MAX_SOURCE_NETWORK_REQUESTS, "15.9L source network budget exceeded");
    return globalThis.fetch(...args);
  };

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const source = sourceById.get(target.source_signal_id);
    assert.ok(source, "15.9L target Source lookup failed");
    const origin = classifySourceOrigin(source.canonical_url);
    assert.equal(origin?.kind, "external_web", "15.9L targets must retain external_web origin");

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
      items.push(contextDriftItem(target, integrity));
      console.log(`[15.9L] ${index + 1}/${PHASE15_9L_TARGET_COUNT} ordinal=${target.baseline_ordinal} context_integrity=false model_calls=0`);
      continue;
    }

    const attempts = [];
    const countedModelFetch = async (...args) => {
      modelCalls += 1;
      assert.ok(modelCalls <= PHASE15_9L_MAX_MODEL_CALLS, "15.9L model-call budget exceeded");
      return globalThis.fetch(...args);
    };
    const observedProviderFetch = createPhase15_9LObservedProviderFetch(countedModelFetch, {
      onAttempt: (metadata) => attempts.push(metadata),
    });

    const result = await resolveSourceProblemFormationAudit({
      ...source,
      source_platform: origin.kind,
    }, {
      fetchContext: async () => first,
      env: {
        ...process.env,
        OPENAI_SOURCE_FORMATION_MODEL: provider.model,
      },
      fetchImpl: observedProviderFetch,
      maxSemanticAttempts: 2,
    });

    assertPhase15_9LProviderAttemptContract(attempts, result.recovery);
    const item = {
      context_integrity_ok: true,
      context_failures: [],
      ...buildPhase15_9LArtifactItem({ target, result, attempts }),
    };
    items.push(item);
    console.log(`[15.9L] ${index + 1}/${PHASE15_9L_TARGET_COUNT} ordinal=${target.baseline_ordinal} state=${item.formation_state} resolved=${item.resolved} recovery=${item.recovery.attempted}/${item.recovery.recovered}`);
  }

  assert.equal(items.length, PHASE15_9L_TARGET_COUNT);
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.9L must remain database read-only");

  const summary = summarizePhase15_9L(items);
  const contextIntegrityPassed = items.filter((item) => item.context_integrity_ok).length;
  const conclusion = contextIntegrityPassed === PHASE15_9L_TARGET_COUNT
    ? "production_formation_recovery_policy_shadow_verified"
    : "production_formation_recovery_policy_verification_blocked_by_context_drift";

  const artifact = {
    phase: "15.9L",
    version: PHASE15_9L_VERSION,
    authority: "read_only_shadow_verification_of_promoted_formation_provider_recovery_policy",
    upstream: {
      phase15_9k_closed: true,
      target_ordinals: PHASE15_9L_TARGET_ORDINALS,
      full_context_outcomes: PHASE15_9L_EXPECTED_OUTCOME_TOTAL,
      blind_overlap_before_url_body_read: blindOverlap,
    },
    recovery_policy: authority,
    provider: {
      name: "openai",
      model: provider.model,
      actual_source_platform_supplied: "external_web",
    },
    summary: {
      ...summary,
      context_integrity_passed: contextIntegrityPassed,
      context_drift: PHASE15_9L_TARGET_COUNT - contextIntegrityPassed,
    },
    results: items,
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: PHASE15_9L_MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: modelCalls,
      model_calls_max: PHASE15_9L_MAX_MODEL_CALLS,
      database_writes: 0,
      protected_before: protectedBefore,
      protected_after: protectedAfter,
    },
    conclusion,
    downstream_authority: {
      incident_identity_assigned: false,
      problem_signature_assigned: false,
      public_evidence_created: false,
      publication_mutations: 0,
      ordinal_4_current_context_replacement: false,
    },
  };
  assertArtifactPrivacy(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_VERIFICATION_COMPLETE",
    phase: "15.9L",
    version: PHASE15_9L_VERSION,
    observer_version: authority.observer_version,
    prompt_version: authority.prompt_version,
    recovery_version: authority.recovery_version,
    summary: artifact.summary,
    conclusion,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_write_statements: 0,
    protected_domains_unchanged: true,
    artifact_contains_raw_source_body: false,
    incident_authority_granted: false,
    publication_authority_granted: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9L] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
