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
  buildPhase15_9RCscFeatureRestrictionPlan,
  getPhase15_9RCscFeatureRestrictionPlanSummary,
  PHASE15_9R_CAMPAIGN_VERSION,
  PHASE15_9R_PROTECTED_DECISION_ID,
  PHASE15_9R_PROTECTED_INCIDENT_KEY,
  PHASE15_9R_PROTECTED_SOURCE_CONTENT_SHA256,
  PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
  PHASE15_9R_SOURCE_PLATFORM,
} from "../lib/sources/phase15-9r-csc-feature-restriction-plan.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

function parseOutputPath() {
  const value = process.argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length) : "phase15-9r-csc-feature-restriction-search.json";
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
    ["formation_assessments", "ar_source_formation_assessments"],
    ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"],
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
    .eq("source_platform", PHASE15_9R_SOURCE_PLATFORM)
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
  assert.equal(data?.length, 1, "Phase 15.9R requires exactly one owner curator for ingestion provenance");
  return data[0].user_id;
}

async function countCampaignRuns(client) {
  const { count, error } = await client
    .from("ar_source_ingestion_runs")
    .select("*", { count: "exact", head: true })
    .contains("request_metadata", { csc_campaign_version: PHASE15_9R_CAMPAIGN_VERSION });
  if (error) throw error;
  return count ?? 0;
}

async function assertProtectedAuthorityStillHeld(client) {
  const { data: sourceRows, error: sourceError } = await client
    .from("ar_source_signals")
    .select("id, external_content_id, content_hash")
    .eq("source_platform", PHASE15_9R_SOURCE_PLATFORM)
    .eq("external_content_id", PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256);
  if (sourceError) throw sourceError;
  assert.equal(sourceRows?.length, 1, "Phase 15.9R protected Source must resolve uniquely");
  assert.equal(
    sourceRows[0].content_hash,
    PHASE15_9R_PROTECTED_SOURCE_CONTENT_SHA256,
    "Phase 15.9R must preserve the protected Source content hash",
  );

  const { data: decisionRows, error: decisionError } = await client
    .from("ar_source_incident_curator_decisions")
    .select("id, source_signal_id, evidence_decision, incident_action, incident_persistence_authorized, new_incident_key")
    .eq("id", PHASE15_9R_PROTECTED_DECISION_ID);
  if (decisionError) throw decisionError;
  assert.equal(decisionRows?.length, 1, "Phase 15.9R protected curator decision must resolve uniquely");
  assert.equal(decisionRows[0].source_signal_id, sourceRows[0].id);
  assert.equal(decisionRows[0].evidence_decision, "accept");
  assert.equal(decisionRows[0].incident_action, "create_new");
  assert.equal(decisionRows[0].incident_persistence_authorized, true);
  assert.equal(decisionRows[0].new_incident_key, PHASE15_9R_PROTECTED_INCIDENT_KEY);

  const { data: incidentRows, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key, created_from_curator_decision_id")
    .eq("incident_key", PHASE15_9R_PROTECTED_INCIDENT_KEY);
  if (incidentError) throw incidentError;
  assert.equal(incidentRows?.length, 1, "Phase 15.9R protected Incident must resolve uniquely");
  assert.equal(incidentRows[0].created_from_curator_decision_id, PHASE15_9R_PROTECTED_DECISION_ID);

  const { data: linkRows, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id, curator_decision_id")
    .eq("source_signal_id", sourceRows[0].id);
  if (linkError) throw linkError;
  assert.equal(linkRows?.length, 1, "Phase 15.9R protected Source must have exactly one Incident link");
  assert.equal(linkRows[0].incident_id, incidentRows[0].id);
  assert.equal(linkRows[0].curator_decision_id, PHASE15_9R_PROTECTED_DECISION_ID);

  const { data: executionRows, error: executionError } = await client
    .from("ar_source_incident_decision_executions")
    .select("source_signal_id, incident_id, curator_decision_id, incident_action")
    .eq("curator_decision_id", PHASE15_9R_PROTECTED_DECISION_ID);
  if (executionError) throw executionError;
  assert.equal(executionRows?.length, 1, "Phase 15.9R protected decision must have exactly one execution");
  assert.equal(executionRows[0].source_signal_id, sourceRows[0].id);
  assert.equal(executionRows[0].incident_id, incidentRows[0].id);
  assert.equal(executionRows[0].incident_action, "create_new");

  const { count: publicEvidenceCount, error: publicEvidenceError } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("source_signal_id", sourceRows[0].id);
  if (publicEvidenceError) throw publicEvidenceError;
  assert.equal(publicEvidenceCount ?? 0, 0, "Phase 15.9R protected Source must remain outside Public Evidence");
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
    distinct_from_protected_source:
      signal.external_content_id !== PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
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
    "formation_assessments",
    "curator_decisions",
    "incident_executions",
  ]) {
    assert.equal(after[key], before[key], `Phase 15.9R must not mutate ${key}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const plan = buildPhase15_9RCscFeatureRestrictionPlan();
  const summary = getPhase15_9RCscFeatureRestrictionPlanSummary();

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
      full_context_resolution_authorized: false,
      formation_persistence_authorized: false,
      incident_creation_authorized: false,
      problem_signature_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9R_CSC_ACQUISITION !== "true") {
    throw new Error("Phase 15.9R live acquisition requires ALLOW_PHASE15_9R_CSC_ACQUISITION=true");
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const client = createServiceClient();
  await assertProtectedAuthorityStillHeld(client);
  assert.equal(await countCampaignRuns(client), 0,
    "Phase 15.9R campaign already has ingestion runs; duplicate live execution is forbidden");

  const curatorUserId = await resolveOwnerCurator(client);
  const before = await snapshot(client);
  const queryResults = [];
  const newSignals = [];
  let protectedSourceRediscoveryHits = 0;

  for (const item of plan) {
    const run = await createSourceIngestionRun(client, {
      sourcePlatform: PHASE15_9R_SOURCE_PLATFORM,
      input: item.input,
      curatorUserId,
    });

    try {
      const result = await searchNaverBlogPosts(item.input);
      const protectedHits = result.signals.filter(
        (signal) => signal.external_content_id === PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
      ).length;
      protectedSourceRediscoveryHits += protectedHits;

      const acquisitionSignals = result.signals.filter(
        (signal) => signal.external_content_id !== PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
      );
      const discovery = filterDiscoverySignals(acquisitionSignals);
      const existing = await loadExistingIdentitySet(client, discovery.accepted);
      const newlyObserved = discovery.accepted.filter((signal) => !existing.has(sourceIdentityKey(signal)));

      const persisted = await persistDiscoveredSourceSignals(client, {
        runId: run.id,
        queryText: item.input.q,
        signals: acquisitionSignals,
        fetchedCount: result.fetched_count,
        skippedCount: result.skipped_count + protectedHits,
      });

      assert.equal(
        persisted.run.inserted_count,
        newlyObserved.length,
        `Phase 15.9R inserted count mismatch for ${item.query_key}`,
      );

      const safeNew = newlyObserved.map(safeNewSignal);
      newSignals.push(...safeNew);
      queryResults.push({
        query_key: item.query_key,
        q: item.input.q,
        sort: item.input.sort,
        fetched_count: result.fetched_count,
        protected_source_hits: protectedHits,
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
    before.source_ingestion_runs + plan.length,
    "Phase 15.9R must create exactly eight ingestion run records",
  );
  assert.equal(
    after.source_signals,
    before.source_signals + newSignals.length,
    "Phase 15.9R Source Signal growth must equal the unique inserted cohort",
  );
  assert.equal(await countCampaignRuns(client), plan.length,
    "Phase 15.9R must leave exactly eight campaign ingestion runs");
  await assertProtectedAuthorityStillHeld(client);

  const distinctNewSignals = [
    ...new Map(newSignals.map((item) => [item.source_identity_sha256, item])).values(),
  ];
  assert.equal(
    distinctNewSignals.length,
    newSignals.length,
    "Phase 15.9R newly inserted cohort must remain identity-distinct across requests",
  );
  assert.equal(
    distinctNewSignals.every((item) => item.distinct_from_protected_source),
    true,
    "Phase 15.9R new cohort must exclude the protected Source",
  );

  const newSummary = summarizeNewSignals(distinctNewSignals);
  const artifact = {
    phase: "15.9R",
    version: PHASE15_9R_CAMPAIGN_VERSION,
    authority: "independent_source_acquisition_only",
    plan: summary,
    query_results: queryResults,
    new_source_summary: newSummary,
    new_sources: distinctNewSignals,
    protected_source_rediscovery_hits: protectedSourceRediscoveryHits,
    protected_seed_upserted: false,
    protected_incident_authority_verified: true,
    database_before: before,
    database_after: after,
    blind_evaluation_reads: 0,
    full_source_body_fetches: 0,
    external_model_calls: 0,
    full_context_resolution_mutations: 0,
    formation_mutations: 0,
    incident_mutations: 0,
    public_problem_mutations: 0,
    publication_mutations: 0,
    incident_creation_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "source_url",
    "author_handle",
    "raw_text",
    "curator_decision_id",
    "incident_id",
    "public_problem_id",
  ]) {
    assert.equal(
      serialized.includes(`\"${forbidden}\"`),
      false,
      `Phase 15.9R artifact must not expose ${forbidden}`,
    );
  }

  await writeFile(parseOutputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "CSC_FEATURE_RESTRICTION_SEARCH_COMPLETE",
    campaign_version: PHASE15_9R_CAMPAIGN_VERSION,
    requests: plan.length,
    new_source_summary: newSummary,
    protected_source_rediscovery_hits: protectedSourceRediscoveryHits,
    protected_incident_authority_verified: true,
    full_source_body_fetches: 0,
    incident_mutations: 0,
    publication_mutations: 0,
    output_path: parseOutputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9R] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
