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
  buildPhase15_9CExpandedPlan,
  getPhase15_9CPlanSummary,
  PHASE15_9C_CAMPAIGN_VERSION,
  PHASE15_9C_SEED_CONTENT_SHA256,
  PHASE15_9C_SEED_IDENTITY_SHA256,
  PHASE15_9C_SOURCE_PLATFORM,
} from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

function parseOutputPath() {
  const value = process.argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length) : "phase15-9c-expanded-telecom-search.json";
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
    .eq("source_platform", PHASE15_9C_SOURCE_PLATFORM)
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
  assert.equal(data?.length, 1, "Phase 15.9C requires exactly one owner curator for ingestion provenance");
  return data[0].user_id;
}

async function assertSeedStillHeld(client) {
  const { data: sourceRows, error } = await client
    .from("ar_source_signals")
    .select("id, external_content_id, content_hash")
    .eq("source_platform", PHASE15_9C_SOURCE_PLATFORM)
    .eq("external_content_id", PHASE15_9C_SEED_IDENTITY_SHA256);
  if (error) throw error;
  assert.equal(sourceRows?.length, 1, "Phase 15.9C seed must resolve uniquely");
  assert.equal(sourceRows[0].content_hash, PHASE15_9C_SEED_CONTENT_SHA256,
    "Phase 15.9C must preserve the frozen singleton seed content hash");
  const { count, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("*", { count: "exact", head: true })
    .eq("source_signal_id", sourceRows[0].id);
  if (linkError) throw linkError;
  assert.equal(count ?? 0, 0, "Phase 15.9C seed must remain curator-held with zero Incident links");
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
    distinct_from_seed: signal.external_content_id !== PHASE15_9C_SEED_IDENTITY_SHA256,
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
    assert.equal(after[key], before[key], `Phase 15.9C must not mutate ${key}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const plan = buildPhase15_9CExpandedPlan();
  const summary = getPhase15_9CPlanSummary();

  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      plan: summary,
      queries: plan.map((item) => ({
        query_key: item.query_key,
        q: item.input.q,
        sort: item.input.sort,
        limit: item.input.limit,
      })),
      live_source_supply_mutation_authorized: true,
      incident_creation_authorized: false,
      problem_signature_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9C_EXPANDED_ACQUISITION !== "true") {
    throw new Error("Phase 15.9C live acquisition requires ALLOW_PHASE15_9C_EXPANDED_ACQUISITION=true");
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
      sourcePlatform: PHASE15_9C_SOURCE_PLATFORM,
      input: item.input,
      curatorUserId,
    });

    try {
      const result = await searchNaverBlogPosts(item.input);
      const seedHits = result.signals.filter(
        (signal) => signal.external_content_id === PHASE15_9C_SEED_IDENTITY_SHA256,
      ).length;
      seedRediscoveryHits += seedHits;
      const acquisitionSignals = result.signals.filter(
        (signal) => signal.external_content_id !== PHASE15_9C_SEED_IDENTITY_SHA256,
      );
      const discovery = filterDiscoverySignals(acquisitionSignals);
      const existing = await loadExistingIdentitySet(client, discovery.accepted);
      const newlyObserved = discovery.accepted.filter((signal) => !existing.has(sourceIdentityKey(signal)));

      const persisted = await persistDiscoveredSourceSignals(client, {
        runId: run.id,
        queryText: item.input.q,
        signals: acquisitionSignals,
        fetchedCount: result.fetched_count,
        skippedCount: result.skipped_count + seedHits,
      });

      assert.equal(persisted.run.inserted_count, newlyObserved.length,
        `Phase 15.9C inserted count mismatch for ${item.query_key}`);

      const safeNew = newlyObserved.map(safeNewSignal);
      newSignals.push(...safeNew);
      queryResults.push({
        query_key: item.query_key,
        q: item.input.q,
        sort: item.input.sort,
        fetched_count: result.fetched_count,
        protected_seed_hits: seedHits,
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
    "Phase 15.9C must create exactly eight ingestion run records");
  assert.equal(after.source_signals, before.source_signals + newSignals.length,
    "Phase 15.9C Source Signal growth must equal the unique inserted cohort");
  await assertSeedStillHeld(client);

  const distinctNewSignals = [...new Map(newSignals.map((item) => [item.source_identity_sha256, item])).values()];
  assert.equal(distinctNewSignals.length, newSignals.length,
    "Phase 15.9C newly inserted cohort must remain identity-distinct across requests");
  assert.equal(distinctNewSignals.every((item) => item.distinct_from_seed), true,
    "Phase 15.9C new cohort must exclude the existing singleton seed");

  const newSummary = summarizeNewSignals(distinctNewSignals);
  const artifact = {
    phase: "15.9C",
    version: PHASE15_9C_CAMPAIGN_VERSION,
    authority: "expanded_source_acquisition_only",
    plan: summary,
    query_results: queryResults,
    new_source_summary: newSummary,
    new_sources: distinctNewSignals,
    seed_rediscovery_hits: seedRediscoveryHits,
    protected_seed_upserted: false,
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
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `Phase 15.9C artifact must not expose ${forbidden}`);
  }

  await writeFile(parseOutputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "EXPANDED_TELECOM_SEARCH_COMPLETE",
    campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
    requests: plan.length,
    new_source_summary: newSummary,
    seed_rediscovery_hits: seedRediscoveryHits,
    protected_seed_upserted: false,
    full_source_body_fetches: 0,
    incident_mutations: 0,
    publication_mutations: 0,
    output_path: parseOutputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9C] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
