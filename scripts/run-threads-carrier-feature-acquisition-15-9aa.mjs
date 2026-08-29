import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { searchThreadsPosts } from "../lib/sources/threads-adapter.mjs";
import { filterDiscoverySignals } from "../lib/sources/discovery-prefilter.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistDiscoveredSourceSignals,
} from "../lib/sources/service.mjs";
import {
  buildPhase15_9AAThreadsCarrierFeaturePlan,
  getPhase15_9AAThreadsCarrierFeaturePlanSummary,
  PHASE15_9AA_CAMPAIGN_VERSION,
  PHASE15_9AA_MAX_REQUESTS,
  PHASE15_9AA_PROTECTED_INCIDENT_KEY,
  PHASE15_9AA_SOURCE_PLATFORM,
} from "../lib/sources/phase15-9aa-threads-carrier-feature-plan.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9AA";

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9aa-threads-carrier-feature-acquisition.json";
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

async function snapshot(client) {
  const tables = [
    ["source_signals", "ar_source_signals"],
    ["source_observations", "ar_source_signal_observations"],
    ["source_ingestion_runs", "ar_source_ingestion_runs"],
    ["raw_inputs", "ar_raw_inputs"],
    ["pain_evidences", "ar_pain_evidences"],
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
    ["formation_assessments", "ar_source_formation_assessments"],
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

function sourceIdentityKey(signal) {
  return `${signal.source_platform}\u0000${signal.external_content_id}`;
}

function sourceExternalIdentityHash(signal) {
  return createHash("sha256").update(sourceIdentityKey(signal)).digest("hex");
}

async function loadExistingIdentitySet(client, signals) {
  if (signals.length === 0) return new Set();
  const ids = [...new Set(signals.map((signal) => signal.external_content_id))];
  const { data, error } = await client
    .from("ar_source_signals")
    .select("source_platform, external_content_id")
    .eq("source_platform", PHASE15_9AA_SOURCE_PLATFORM)
    .in("external_content_id", ids);
  if (error) throw error;
  return new Set((data ?? []).map(sourceIdentityKey));
}

async function resolveOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner")
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9AA requires exactly one owner curator for ingestion provenance");
  return data[0].user_id;
}

async function countCampaignRuns(client) {
  const { count, error } = await client
    .from("ar_source_ingestion_runs")
    .select("*", { count: "exact", head: true })
    .contains("request_metadata", {
      threads_carrier_feature_campaign_version: PHASE15_9AA_CAMPAIGN_VERSION,
    });
  if (error) throw error;
  return count ?? 0;
}

async function assertProtectedAuthority(client) {
  const { data: incidents, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .eq("incident_key", PHASE15_9AA_PROTECTED_INCIDENT_KEY)
    .limit(2);
  if (error) throw error;
  assert.equal(incidents?.length, 1, "15.9AA requires exactly one governed CSC Incident");
  const incident = incidents[0];
  assert.equal(
    await countWhere(client, "ar_source_incident_links", "incident_id", incident.id),
    2,
    "15.9AA requires exactly two Sources linked to the existing CSC Incident",
  );
  assert.equal(
    await countWhere(client, "ar_public_problem_evidence_snapshots", "incident_id", incident.id),
    0,
    "15.9AA existing CSC Incident must remain outside Public Evidence",
  );
}

function safeNewSignal(signal) {
  const admission = classifySourceAdmission(signal);
  return {
    source_platform: signal.source_platform,
    source_external_identity_sha256: sourceExternalIdentityHash(signal),
    source_content_sha256: signal.content_hash,
    published_at: signal.published_at,
    admission_decision: admission.decision,
    admission_reason_codes: admission.reason_codes,
    requires_full_context: Boolean(admission.requires_full_context),
  };
}

function summarizeNewSignals(signals) {
  const summary = { total: signals.length, candidate: 0, review: 0, reject: 0, full_context_required: 0 };
  for (const signal of signals) {
    summary[signal.admission_decision] += 1;
    if (signal.requires_full_context) summary.full_context_required += 1;
  }
  return summary;
}

function assertProtectedDomainsUnchanged(before, after) {
  for (const key of [
    "raw_inputs",
    "pain_evidences",
    "full_context_outcomes",
    "formation_assessments",
    "source_incidents",
    "source_incident_links",
    "curator_decisions",
    "incident_executions",
    "public_problems",
    "public_evidence",
    "public_feed",
  ]) {
    assert.equal(after[key], before[key], `15.9AA must not mutate ${key}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const plan = buildPhase15_9AAThreadsCarrierFeaturePlan();
  const planSummary = getPhase15_9AAThreadsCarrierFeaturePlanSummary();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      plan: planSummary,
      requests: plan.map((item) => ({
        query_key: item.query_key,
        q: item.input.q,
        search_type: item.input.search_type,
        limit: item.input.limit,
      })),
      source_supply_mutation_authorized: true,
      full_context_resolution_authorized: false,
      formation_authorized: false,
      incident_authorized: false,
      public_problem_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_PHASE15_9AA_THREADS_CARRIER_FEATURE_ACQUISITION,
    "true",
    "15.9AA live acquisition requires explicit technical opt-in",
  );
  if (!process.env.THREADS_ACCESS_TOKEN) {
    throw new Error("THREADS_ACCESS_TOKEN is required");
  }

  const client = createServiceClient();
  await assertProtectedAuthority(client);
  assert.equal(await countCampaignRuns(client), 0, "15.9AA campaign already executed; duplicate live run forbidden");

  const curatorUserId = await resolveOwnerCurator(client);
  const before = await snapshot(client);
  const requestResults = [];
  const newlyInserted = [];

  for (const item of plan) {
    const run = await createSourceIngestionRun(client, {
      sourcePlatform: PHASE15_9AA_SOURCE_PLATFORM,
      input: item.input,
      curatorUserId,
    });

    try {
      const result = await searchThreadsPosts(item.input);
      const discovery = filterDiscoverySignals(result.signals);
      const existing = await loadExistingIdentitySet(client, discovery.accepted);
      const newSignals = discovery.accepted.filter((signal) => !existing.has(sourceIdentityKey(signal)));

      const persisted = await persistDiscoveredSourceSignals(client, {
        runId: run.id,
        queryText: item.input.q,
        signals: result.signals,
        fetchedCount: result.fetched_count,
        skippedCount: result.skipped_count,
      });

      assert.equal(
        persisted.run.inserted_count,
        newSignals.length,
        `15.9AA inserted count mismatch for ${item.query_key}`,
      );

      newlyInserted.push(...newSignals.map(safeNewSignal));
      requestResults.push({
        query_key: item.query_key,
        q: item.input.q,
        search_type: item.input.search_type,
        fetched_count: result.fetched_count,
        discovery_continue_count: persisted.discovery.summary.continue_count,
        discovery_reject_count: persisted.discovery.summary.reject_count,
        inserted_count: persisted.run.inserted_count,
        duplicate_count: persisted.run.duplicate_count,
        new_admission_candidate_count: persisted.run.new_admission_candidate_count ?? 0,
        new_admission_review_count: persisted.run.new_admission_review_count ?? 0,
        new_admission_reject_count: persisted.run.new_admission_reject_count ?? 0,
      });
    } catch (error) {
      await failSourceIngestionRun(client, run.id, error);
      throw error;
    }
  }

  const after = await snapshot(client);
  assertProtectedDomainsUnchanged(before, after);
  assert.equal(
    after.source_ingestion_runs,
    before.source_ingestion_runs + PHASE15_9AA_MAX_REQUESTS,
    "15.9AA must create exactly eight ingestion run records",
  );
  assert.equal(
    after.source_signals,
    before.source_signals + newlyInserted.length,
    "15.9AA Source growth must equal unique inserted cohort size",
  );
  assert.equal(
    await countCampaignRuns(client),
    PHASE15_9AA_MAX_REQUESTS,
    "15.9AA must leave exactly eight campaign ingestion runs",
  );
  await assertProtectedAuthority(client);

  const distinctNew = [...new Map(newlyInserted.map((item) => [item.source_external_identity_sha256, item])).values()];
  assert.equal(
    distinctNew.length,
    newlyInserted.length,
    "15.9AA newly inserted cohort must remain identity-distinct across requests",
  );

  const artifact = {
    phase: PHASE,
    version: PHASE15_9AA_CAMPAIGN_VERSION,
    authority: "threads_carrier_feature_source_acquisition_only",
    promotion_gate_before: {
      existing_csc_incident_count: 1,
      existing_csc_source_count: 2,
      minimum_distinct_incidents_required: 2,
      public_problem_draft_ready: false,
      blocking_reason: "distinct_incident_support_missing",
    },
    plan: planSummary,
    request_results: requestResults,
    new_source_summary: summarizeNewSignals(distinctNew),
    new_sources: distinctNew,
    database_before: before,
    database_after: after,
    provider_requests: PHASE15_9AA_MAX_REQUESTS,
    external_model_calls: 0,
    full_context_mutations: 0,
    formation_mutations: 0,
    incident_mutations: 0,
    public_problem_mutations: 0,
    publication_mutations: 0,
    canonical_followup_authority: "post_campaign_database_readback",
    full_context_resolution_authorized: false,
    formation_authorized: false,
    incident_authorized: false,
    public_problem_authorized: false,
    public_evidence_authorized: false,
    publication_authorized: false,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "external_content_id", "source_signal_id", "canonical_url", "source_url", "author_handle", "raw_text",
    "incident_id", "curator_user_id", "public_problem_id", "provider_request_id", "THREADS_ACCESS_TOKEN",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9AA artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "THREADS_CARRIER_FEATURE_ACQUISITION_COMPLETE",
    phase: PHASE,
    new_source_summary: artifact.new_source_summary,
    source_signal_delta: after.source_signals - before.source_signals,
    source_observation_delta: after.source_observations - before.source_observations,
    ingestion_run_delta: after.source_ingestion_runs - before.source_ingestion_runs,
    provider_requests: PHASE15_9AA_MAX_REQUESTS,
    external_model_calls: 0,
    incident_mutations: 0,
    public_problem_mutations: 0,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9AA] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
