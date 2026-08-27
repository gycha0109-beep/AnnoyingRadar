import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { comparePhase15_9GFetches } from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";
import {
  assertPhase15_9JContextIntegrity,
  buildPhase15_9JArtifactItem,
  PHASE15_9J_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9J_MAX_MODEL_CALLS,
  PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9J_SAMPLE_FINGERPRINT,
  PHASE15_9J_SOURCE_BATCH_VERSION,
  PHASE15_9J_TARGET_COUNT,
  PHASE15_9J_TARGET_ORDINALS,
  PHASE15_9J_VERSION,
  validatePhase15_9JOutcomeAuthority,
} from "../lib/sources/phase15-9j-formation-audit.mjs";
import { classifySourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "../lib/sources/source-full-context-fetch.mjs";
import {
  getSourceProblemFormationProviderConfig,
  judgeSourceProblemFormationSemantics,
  resolveSourceProblemFormationAudit,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
  SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
} from "../lib/sources/source-problem-formation-observer.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const TARGET_LOOKUP_LIMIT = 20;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9j-durable-candidate-formation-audit.json";
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
    client
      .from("ar_source_incident_links")
      .select("source_signal_id")
      .in("source_signal_id", sourceIds)
      .limit(TARGET_LOOKUP_LIMIT),
    client
      .from("ar_public_problem_evidence_snapshots")
      .select("source_signal_id")
      .in("source_signal_id", sourceIds)
      .limit(TARGET_LOOKUP_LIMIT),
  ]);
  if (linkError) throw linkError;
  if (evidenceError) throw evidenceError;
  assert.equal((links ?? []).length, 0, "15.9J target Sources must remain outside Incident authority");
  assert.equal((evidence ?? []).length, 0, "15.9J target Sources must remain outside Public Evidence authority");
}

async function loadTargetSignals(client, sourceIds) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .in("id", sourceIds)
    .limit(TARGET_LOOKUP_LIMIT);
  if (error) throw error;
  assert.equal((data ?? []).length, PHASE15_9J_TARGET_COUNT, "every Phase 15.9J durable Candidate Source must still exist");
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function summarize(items) {
  const states = { eligible: 0, provenance_review: 0, review: 0, reject: 0 };
  const reasons = {};
  for (const item of items) {
    const state = Object.hasOwn(states, item.formation_state) ? item.formation_state : "review";
    states[state] += 1;
    for (const reason of item.reason_codes ?? []) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return {
    total: items.length,
    ...states,
    resolved: items.filter((item) => item.resolved).length,
    unresolved: items.filter((item) => !item.resolved).length,
    reason_codes: Object.fromEntries(Object.entries(reasons).sort(([left], [right]) => left.localeCompare(right))),
    provider_recovery_attempted: items.filter((item) => item.recovery.attempted).length,
    provider_recovery_recovered: items.filter((item) => item.recovery.recovered).length,
  };
}

function conclusionFor(summary) {
  if (summary.eligible > 0) return "formation_eligible_candidates_detected";
  if (summary.provenance_review > 0 || summary.review > 0 || summary.unresolved > 0) return "formation_followup_required";
  return "formation_rejects_only";
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
    assert.equal(serialized.includes(forbidden), false, `15.9J artifact must not expose ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9J",
      version: PHASE15_9J_VERSION,
      source_batch_version: PHASE15_9J_SOURCE_BATCH_VERSION,
      upstream_sample_fingerprint: PHASE15_9J_SAMPLE_FINGERPRINT,
      target_ordinals: PHASE15_9J_TARGET_ORDINALS,
      target_count: PHASE15_9J_TARGET_COUNT,
      max_source_network_requests: PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: PHASE15_9J_MAX_MODEL_CALLS,
      database_write_statements: 0,
      incident_identity_authorized: false,
      problem_signature_authorized: false,
      canonical_problem_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9J_FORMATION_AUDIT, "true", "Live 15.9J requires explicit Formation audit opt-in");
  const client = createServiceClient();
  const protectedBefore = await snapshotProtectedDomains(client);
  assert.equal(protectedBefore.full_context_outcomes, PHASE15_9J_EXPECTED_OUTCOME_TOTAL,
    "15.9J requires the closed 85-row Phase 15.9I outcome baseline");

  const durableRows = await loadPhase15_9IOutcomes(client);
  const targets = validatePhase15_9JOutcomeAuthority(durableRows);
  const targetIds = targets.map((target) => target.source_signal_id);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = targetIds.filter((id) => blindIds.has(id)).length;
  assert.equal(blindOverlap, 0, "15.9J must prove zero Blind overlap before canonical URL/body reads");
  await assertNoDownstreamAssignments(client, targetIds);

  const sourceById = await loadTargetSignals(client, targetIds);
  const provider = getSourceProblemFormationProviderConfig(process.env);
  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const items = [];

  const sourceFetchImpl = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS,
      "15.9J source network budget exceeded");
    return globalThis.fetch(...args);
  };
  const modelFetchImpl = async (...args) => {
    modelCalls += 1;
    assert.ok(modelCalls <= PHASE15_9J_MAX_MODEL_CALLS, "15.9J model-call budget exceeded");
    return globalThis.fetch(...args);
  };

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const source = sourceById.get(target.source_signal_id);
    assert.ok(source, "15.9J target Source lookup failed");
    const origin = classifySourceOrigin(source.canonical_url);
    assert.equal(origin?.kind, "external_web", "15.9J targets must retain external_web origin");

    const first = await fetchSourceFullContext(source, {
      fetchImpl: sourceFetchImpl,
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
    });
    const second = await fetchSourceFullContext(source, {
      fetchImpl: sourceFetchImpl,
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
    });
    assertPhase15_9JContextIntegrity(first, second, target, { compareFetches: comparePhase15_9GFetches });

    const formationResult = await resolveSourceProblemFormationAudit(source, {
      fetchContext: async () => first,
      judgeContext: (input) => judgeSourceProblemFormationSemantics({
        ...input,
        sourcePlatform: origin.kind,
        ...provider,
        fetchImpl: modelFetchImpl,
      }),
      maxSemanticAttempts: 2,
    });
    if (formationResult.recovery?.attempted) {
      assert.equal(formationResult.recovery.trigger_reason_code, "source_formation_provider_incomplete",
        "15.9J permits retry only for provider-incomplete Formation responses");
    }

    const item = buildPhase15_9JArtifactItem({ target, formationResult, context: first });
    if (item.formation_state === "eligible") {
      assert.equal(item.formation_semantic?.evidence_quote_grounded, true,
        "Formation eligible requires an exact grounded evidence quote");
    }
    items.push(item);
    console.log(`[15.9J] ${index + 1}/${PHASE15_9J_TARGET_COUNT} ordinal=${target.baseline_ordinal} state=${item.formation_state} resolved=${item.resolved} retry=${item.recovery.attempted}`);
  }

  assert.equal(items.length, PHASE15_9J_TARGET_COUNT, "15.9J must audit exactly three durable Candidates");
  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.9J must remain database read-only");

  const summary = summarize(items);
  const artifact = {
    version: PHASE15_9J_VERSION,
    authority: "empirical_formation_audit_not_incident_authority",
    source_authority: {
      source_batch_version: PHASE15_9J_SOURCE_BATCH_VERSION,
      upstream_sample_fingerprint: PHASE15_9J_SAMPLE_FINGERPRINT,
      target_ordinals: PHASE15_9J_TARGET_ORDINALS,
      target_count: PHASE15_9J_TARGET_COUNT,
      blind_overlap_before_url_body_read: blindOverlap,
    },
    formation_authority: {
      observer_version: SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
      prompt_version: SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
      provider: "openai",
      model: provider.model,
      actual_source_platform_supplied: "external_web",
    },
    summary,
    items,
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: modelCalls,
      model_calls_max: PHASE15_9J_MAX_MODEL_CALLS,
      database_writes: 0,
      protected_before: protectedBefore,
      protected_after: protectedAfter,
      protected_domains_unchanged: true,
    },
    downstream_authority: {
      formation_audit_completed: true,
      incident_identity_assigned: false,
      incident_rows_written: 0,
      source_incident_links_written: 0,
      problem_signature_assigned: false,
      canonical_problem_authority_granted: false,
      publication_authority_granted: false,
    },
    conclusion: conclusionFor(summary),
  };
  assertArtifactPrivacy(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_AUDIT_COMPLETE",
    phase: "15.9J",
    summary,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_writes: 0,
    protected_domains_unchanged: true,
    conclusion: artifact.conclusion,
    output_path: outputPath,
    incident_authority_granted: false,
    canonical_problem_authority_granted: false,
    publication_authority_granted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9J] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
