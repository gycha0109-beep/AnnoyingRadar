import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { searchNaverBlogPosts } from "../lib/sources/naver-blog-adapter.mjs";
import { filterDiscoverySignals } from "../lib/sources/discovery-prefilter.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistDiscoveredSourceSignals,
} from "../lib/sources/service.mjs";
import {
  buildPhase15_9BTargetedPlan,
  getPhase15_9BPlanSummary,
  PHASE15_9B_CAMPAIGN_VERSION,
  PHASE15_9B_SEED_IDENTITY_SHA256,
  PHASE15_9B_SOURCE_PLATFORM,
} from "../lib/sources/phase15-9b-targeted-telecom-plan.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

function parseOutputPath() {
  const value = process.argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length) : "phase15-9b-targeted-telecom-acquisition.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
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
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

function sourceIdentityKey(signal) {
  return `${signal.source_platform}\u0000${signal.external_content_id}`;
}

async function loadExistingIdentitySet(client, signals) {
  if (signals.length === 0) return new Set();
  const externalIds = [...new Set(signals.map((signal) => signal.external_content_id))];
  const { data, error } = await client
    .from("ar_source_signals")
    .select("source_platform, external_content_id")
    .eq("source_platform", PHASE15_9B_SOURCE_PLATFORM)
    .in("external_content_id", externalIds);
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
  assert.equal(data?.length, 1, "Phase 15.9B requires exactly one owner curator for ingestion provenance");
  return data[0].user_id;
}

async function assertSeedStillHeld(client) {
  const { data: sourceRows, error } = await client
    .from("ar_source_signals")
    .select("id, external_content_id")
    .eq("source_platform", PHASE15_9B_SOURCE_PLATFORM)
    .eq("external_content_id", PHASE15_9B_SEED_IDENTITY_SHA256);
  if (error) throw error;
  assert.equal(sourceRows?.length, 1, "Phase 15.9B seed must resolve uniquely");
  const { count, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("*", { count: "exact", head: true })
    .eq("source_signal_id", sourceRows[0].id);
  if (linkError) throw linkError;
  assert.equal(count ?? 0, 0, "Phase 15.9B seed must remain curator-held with zero Incident links");
}

function safeNewSignal(signal) {
  const admission = classifySourceAdmission(signal);
  return {
    source_platform: signal.source_platform,
    source_identity_sha256: signal.external_content_id,
    source_content_sha256: signal.content_hash,
    published_at: signal.published_at,
    admission_decision: admission.decision,
    admission_reason_codes: admission.reason_codes,
    requires_full_context: Boolean(admission.requires_full_context),
    distinct_from_seed: signal.external_content_id !== PHASE15_9B_SEED_IDENTITY_SHA256,
  };
}

function summarizeNewSignals(signals) {
  const summary = { total: signals.length, candidate: 0, review: 0, reject: 0 };
  for (const signal of signals) summary[signal.admission_decision] += 1;
  return summary;
}

function assertProtectedDomainsUnchanged(before, after) {
  for (const key of [
    "raw_inputs",
    "pain_evidences",
    "public_problems",
    "public_evidence",
    "public_feed",
    "source_incidents",
    "source_incident_links",
    "full_context_outcomes",
  ]) {
    assert.equal(after[key], before[key], `Phase 15.9B must not mutate ${key}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const plan = buildPhase15_9BTargetedPlan();
  const summary = getPhase15_9BPlanSummary();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      plan: summary,
      queries: plan.map((item) => ({ query_key: item.query_key, q: item.input.q, limit: item.input.limit })),
      source_supply_mutation_authorized: false,
      incident_creation_authorized: false,
      problem_signature_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9B_TARGETED_ACQUISITION !== "true") {
    throw new Error("Phase 15.9B live acquisition requires ALLOW_PHASE15_9B_TARGETED_ACQUISITION=true");
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const client = createServiceClient();
  await assertSeedStillHeld(client);
  const curatorUserId = await resolveOwnerCurator(client);
  const before = await snapshot(client);

  const queryResults = [];
  const newSignals = [];
  let seedRediscoveryHits = 0;

  for (const item of plan) {
    const run = await createSourceIngestionRun(client, {
      sourcePlatform: PHASE15_9B_SOURCE_PLATFORM,
      input: item.input,
      curatorUserId,
    });

    try {
      const result = await searchNaverBlogPosts(item.input);
      const discovery = filterDiscoverySignals(result.signals);
      const existing = await loadExistingIdentitySet(client, discovery.accepted);
      const newlyObserved = discovery.accepted.filter((signal) => !existing.has(sourceIdentityKey(signal)));
      seedRediscoveryHits += result.signals.filter(
        (signal) => signal.external_content_id === PHASE15_9B_SEED_IDENTITY_SHA256,
      ).length;

      const persisted = await persistDiscoveredSourceSignals(client, {
        runId: run.id,
        queryText: item.input.q,
        signals: result.signals,
        fetchedCount: result.fetched_count,
        skippedCount: result.skipped_count,
      });

      assert.equal(persisted.run.inserted_count, newlyObserved.length,
        `Phase 15.9B inserted count mismatch for ${item.query_key}`);

      const safeNew = newlyObserved.map(safeNewSignal);
      newSignals.push(...safeNew);
      queryResults.push({
        query_key: item.query_key,
        q: item.input.q,
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
  assert.equal(after.source_ingestion_runs, before.source_ingestion_runs + plan.length,
    "Phase 15.9B must create exactly four ingestion run records");
  assert.equal(after.source_signals, before.source_signals + newSignals.length,
    "Phase 15.9B Source Signal growth must equal the unique inserted cohort");
  await assertSeedStillHeld(client);

  const distinctNewSignals = [...new Map(newSignals.map((item) => [item.source_identity_sha256, item])).values()];
  assert.equal(distinctNewSignals.length, newSignals.length,
    "Phase 15.9B newly inserted cohort must remain identity-distinct across requests");
  assert.equal(distinctNewSignals.every((item) => item.distinct_from_seed), true,
    "Phase 15.9B new cohort must exclude the existing singleton seed");

  const newSummary = summarizeNewSignals(distinctNewSignals);
  const artifact = {
    phase: "15.9B",
    version: PHASE15_9B_CAMPAIGN_VERSION,
    authority: "targeted_source_acquisition_only",
    plan: summary,
    query_results: queryResults,
    new_source_summary: newSummary,
    new_sources: distinctNewSignals,
    seed_rediscovery_hits: seedRediscoveryHits,
    database_before: before,
    database_after: after,
    blind_120_reads: 0,
    full_source_body_fetches: 0,
    external_model_calls: 0,
    incident_creation_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of ["source_signal_id", "canonical_url", "source_url", "author_handle", "raw_text", "incident_id", "public_problem_id"]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `Phase 15.9B artifact must not expose ${forbidden}`);
  }

  await writeFile(parseOutputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "TARGETED_TELECOM_ACQUISITION_COMPLETE",
    campaign_version: PHASE15_9B_CAMPAIGN_VERSION,
    requests: plan.length,
    new_source_summary: newSummary,
    seed_rediscovery_hits: seedRediscoveryHits,
    full_source_body_fetches: 0,
    incident_mutations: 0,
    publication_mutations: 0,
    output_path: parseOutputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9B] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
