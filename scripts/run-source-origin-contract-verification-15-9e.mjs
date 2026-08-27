import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { PHASE15_9C_CAMPAIGN_VERSION } from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";
import { classifySourceOrigin, SOURCE_ORIGIN_CLASSIFIER_VERSION } from "../lib/sources/source-origin.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE_VERSION = "phase15.9e-source-origin-contract-v0.1";
const EXPECTED_RUNS = 8;
const EXPECTED_OBSERVATIONS = 351;
const EXPECTED_COHORT = 313;
const EXPECTED_NAVER_BLOG = 5;
const EXPECTED_EXTERNAL_WEB = 308;
const SIGNAL_CHUNK_SIZE = 100;

function parseOutputPath() {
  const value = process.argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length) : "phase15-9e-source-origin-contract-verification.json";
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

async function loadCampaignRuns(client) {
  const { data, error } = await client
    .from("ar_source_ingestion_runs")
    .select("id, source_platform, status, started_at, completed_at, request_metadata")
    .eq("source_platform", "naver_blog")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const runs = (data ?? []).filter(
    (row) => row.request_metadata?.expanded_campaign_version === PHASE15_9C_CAMPAIGN_VERSION,
  );
  assert.equal(runs.length, EXPECTED_RUNS, "15.9E requires exactly the eight authoritative 15.9C runs");
  assert.equal(new Set(runs.map((row) => row.request_metadata?.expanded_query_key)).size, EXPECTED_RUNS);
  assert.equal(runs.every((row) => row.request_metadata?.provider === "naver_api_hub"), true,
    "15.9E provider authority must remain naver_api_hub on the ingestion runs");
  assert.equal(runs.every((row) => row.request_metadata?.resource === "blog_search"), true,
    "15.9E provider resource must remain blog_search");
  return runs;
}

async function loadObservedIds(client, runIds) {
  const { data, error } = await client
    .from("ar_source_signal_observations")
    .select("source_signal_id, ingestion_run_id")
    .in("ingestion_run_id", runIds)
    .limit(2000);
  if (error) throw error;
  const rows = data ?? [];
  assert.equal(rows.length, EXPECTED_OBSERVATIONS, "15.9E expects the frozen 351 campaign observations");
  return [...new Set(rows.map((row) => row.source_signal_id))];
}

async function loadSignals(client, ids, fields) {
  const rows = [];
  for (let index = 0; index < ids.length; index += SIGNAL_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SIGNAL_CHUNK_SIZE);
    const { data, error } = await client.from("ar_source_signals").select(fields).in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function reconstructCohort(identityRows, runs) {
  const starts = runs.map((row) => Date.parse(row.started_at)).filter(Number.isFinite);
  const ends = runs.map((row) => Date.parse(row.completed_at)).filter(Number.isFinite);
  assert.equal(starts.length, runs.length);
  assert.equal(ends.length, runs.length);
  const lower = Math.min(...starts);
  const upper = Math.max(...ends);
  const cohortIds = identityRows
    .filter((row) => {
      const firstSeen = Date.parse(row.first_seen_at);
      return Number.isFinite(firstSeen) && firstSeen >= lower && firstSeen <= upper;
    })
    .map((row) => row.id);
  assert.equal(cohortIds.length, EXPECTED_COHORT, "15.9E must reconstruct exactly 313 newly inserted 15.9C Sources");
  assert.equal(new Set(cohortIds).size, EXPECTED_COHORT);
  return cohortIds;
}

async function loadLinkedSourceIds(client) {
  const { data, error } = await client
    .from("ar_source_incident_links")
    .select("source_signal_id")
    .limit(100);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.source_signal_id))];
}

function classifyRows(rows) {
  const counts = { naver_blog: 0, external_web: 0, invalid: 0 };
  for (const row of rows) {
    const origin = classifySourceOrigin(row.canonical_url);
    if (!origin) counts.invalid += 1;
    else if (origin.kind === "naver_blog") counts.naver_blog += 1;
    else if (origin.kind === "external_web") counts.external_web += 1;
  }
  return counts;
}

async function main() {
  if (!process.argv.includes("--live")) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9E",
      version: PHASE_VERSION,
      source_campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
      classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
      expected_cohort: EXPECTED_COHORT,
      expected_naver_blog: EXPECTED_NAVER_BLOG,
      expected_external_web: EXPECTED_EXTERNAL_WEB,
      database_writes: 0,
      incident_authority: false,
      publication_authority: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9E_SOURCE_ORIGIN_VERIFICATION !== "true") {
    throw new Error("15.9E live verification requires ALLOW_PHASE15_9E_SOURCE_ORIGIN_VERIFICATION=true");
  }

  const client = createServiceClient();
  const before = await snapshot(client);
  const runs = await loadCampaignRuns(client);
  const observedIds = await loadObservedIds(client, runs.map((row) => row.id));
  const identityRows = await loadSignals(client, observedIds, "id, first_seen_at");
  const cohortIds = reconstructCohort(identityRows, runs);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = cohortIds.filter((id) => blindIds.has(id)).length;
  assert.equal(blindOverlap, 0, "15.9E refuses to read origin URLs for any blind-evaluation Source");

  const cohort = await loadSignals(
    client,
    cohortIds,
    "id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version",
  );
  assert.equal(cohort.length, EXPECTED_COHORT);
  assert.equal(cohort.every((row) => row.source_platform === "naver_blog"), true,
    "15.9E preserves the historical source_platform identity namespace");
  const explicitOrigins = cohort.filter((row) => row.source_origin_kind !== null
    || row.source_origin_host !== null
    || row.source_origin_classifier_version !== null).length;
  assert.equal(explicitOrigins, 0, "migration 038 must not backfill the historical 15.9C cohort");

  const originCounts = classifyRows(cohort);
  assert.deepEqual(originCounts, {
    naver_blog: EXPECTED_NAVER_BLOG,
    external_web: EXPECTED_EXTERNAL_WEB,
    invalid: 0,
  });

  const linkedIds = await loadLinkedSourceIds(client);
  assert.equal(linkedIds.length, 7, "15.9E expects seven durable Source→Incident links");
  const linked = await loadSignals(
    client,
    linkedIds,
    "id, source_platform, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version",
  );
  assert.equal(linked.length, 7);
  assert.equal(linked.every((row) => row.source_origin_kind === null
    && row.source_origin_host === null
    && row.source_origin_classifier_version === null), true,
    "15.9E must not rewrite Incident-linked historical Source provenance");
  const linkedOriginCounts = classifyRows(linked);
  assert.deepEqual(linkedOriginCounts, { naver_blog: 7, external_web: 0, invalid: 0 });

  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9E verification must not mutate governed data");

  const artifact = {
    phase: "15.9E",
    version: PHASE_VERSION,
    authority: "search_provider_source_origin_contract_verification_only",
    source_campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
    provider_authority: {
      provider: "naver_api_hub",
      resource: "blog_search",
      run_count: runs.length,
    },
    cohort: {
      observations: EXPECTED_OBSERVATIONS,
      newly_inserted_sources: cohortIds.length,
      blind_overlap: blindOverlap,
      historical_explicit_origin_rows: explicitOrigins,
      inferred_origin_counts: originCounts,
    },
    durable_lineage: {
      linked_source_count: linked.length,
      historical_explicit_origin_rows: 0,
      inferred_origin_counts: linkedOriginCounts,
    },
    database_before: before,
    database_after: after,
    database_writes: 0,
    full_context_body_fetches: 0,
    model_calls: 0,
    source_platform_rekey_authorized: false,
    historical_origin_backfill_authorized: false,
    incident_creation_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  await writeFile(parseOutputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "SOURCE_ORIGIN_CONTRACT_VERIFIED",
    cohort: artifact.cohort,
    durable_lineage: artifact.durable_lineage,
    database_writes: 0,
    output_path: parseOutputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9E] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
