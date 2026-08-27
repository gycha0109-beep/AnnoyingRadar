import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { PHASE15_9C_CAMPAIGN_VERSION } from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";
import { PHASE15_9D_REJECTION_STRATA } from "../lib/sources/phase15-9d-rejection-diagnostics.mjs";
import {
  PHASE15_9F_SAMPLE_SIZE,
  PHASE15_9F_VERSION,
  selectPhase15_9FExternalPilot,
  summarizePhase15_9F,
} from "../lib/sources/phase15-9f-external-web-pilot.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { classifySourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "../lib/sources/source-full-context-fetch.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const SOURCE_CHUNK_SIZE = 100;
const EXPECTED_COHORT = 313;
const EXPECTED_NAVER = 5;
const EXPECTED_EXTERNAL = 308;
const MAX_NETWORK_REQUESTS = PHASE15_9F_SAMPLE_SIZE * 4;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9f-external-web-full-context-pilot.json";
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
    .select("id, started_at, completed_at, request_metadata")
    .eq("source_platform", "naver_blog")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const runs = (data ?? []).filter(
    (row) => row.request_metadata?.expanded_campaign_version === PHASE15_9C_CAMPAIGN_VERSION,
  );
  assert.equal(runs.length, 8, "15.9F requires the authoritative eight-run Phase 15.9C campaign");
  assert.equal(new Set(runs.map((row) => row.request_metadata?.expanded_query_key)).size, 8);
  return runs;
}

async function loadObservedIds(client, runIds) {
  const { data, error } = await client
    .from("ar_source_signal_observations")
    .select("source_signal_id, ingestion_run_id")
    .in("ingestion_run_id", runIds)
    .limit(2000);
  if (error) throw error;
  assert.equal((data ?? []).length, 351, "15.9F expects 351 Phase 15.9C observations");
  return [...new Set((data ?? []).map((row) => row.source_signal_id))];
}

async function loadBaseSignals(client, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += SOURCE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SOURCE_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, external_content_id, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, first_seen_at, last_seen_at")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function reconstructNewRejectCohort(signals, runs) {
  const starts = runs.map((row) => Date.parse(row.started_at)).filter(Number.isFinite);
  const ends = runs.map((row) => Date.parse(row.completed_at)).filter(Number.isFinite);
  assert.equal(starts.length, runs.length);
  assert.equal(ends.length, runs.length);
  const lower = Math.min(...starts);
  const upper = Math.max(...ends);

  const cohort = signals
    .filter((signal) => {
      const firstSeen = Date.parse(signal.first_seen_at);
      return Number.isFinite(firstSeen) && firstSeen >= lower && firstSeen <= upper;
    })
    .map((signal) => ({ signal, admission: classifySourceAdmission(signal) }));

  assert.equal(cohort.length, EXPECTED_COHORT, "15.9F must reconstruct exactly 313 newly inserted Sources");
  assert.equal(cohort.every((record) => record.admission.decision === "reject"), true,
    "15.9F cohort must remain rejected by current Source Admission authority");
  return cohort;
}

async function loadUrlFields(client, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += SOURCE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SOURCE_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, canonical_url, source_origin_kind, source_origin_host, source_origin_classifier_version")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((row) => [row.id, row]));
}

function mergeOriginAuthority(cohort, urlFieldsById) {
  return cohort.map((record) => {
    const fields = urlFieldsById.get(record.signal.id);
    assert.ok(fields?.canonical_url, "15.9F sampled cohort Source must have canonical URL");
    const signal = { ...record.signal, ...fields };
    const origin = classifySourceOrigin(signal.canonical_url);
    assert.ok(origin, "15.9F requires classifiable public HTTP(S) canonical URLs");
    return { ...record, signal, origin };
  });
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9F",
      version: PHASE15_9F_VERSION,
      sample_size: PHASE15_9F_SAMPLE_SIZE,
      per_stratum: 4,
      rejection_strata: PHASE15_9D_REJECTION_STRATA,
      external_policy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      database_writes: 0,
      model_calls: 0,
      incident_creation_authorized: false,
      problem_signature_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9F_EXTERNAL_WEB_FULL_CONTEXT !== "true") {
    throw new Error("Phase 15.9F live pilot requires ALLOW_PHASE15_9F_EXTERNAL_WEB_FULL_CONTEXT=true");
  }

  const client = createServiceClient();
  const before = await snapshot(client);
  const runs = await loadCampaignRuns(client);
  const observedIds = await loadObservedIds(client, runs.map((row) => row.id));
  const baseSignals = await loadBaseSignals(client, observedIds);
  const cohort = reconstructNewRejectCohort(baseSignals, runs);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = cohort.filter((record) => blindIds.has(record.signal.id)).length;
  assert.equal(blindOverlap, 0, "15.9F must not expose canonical URLs before proving blind overlap is zero");

  const urlFieldsById = await loadUrlFields(client, cohort.map((record) => record.signal.id));
  const withOrigin = mergeOriginAuthority(cohort, urlFieldsById);
  const originCounts = {
    naver_blog: withOrigin.filter((record) => record.origin.kind === "naver_blog").length,
    external_web: withOrigin.filter((record) => record.origin.kind === "external_web").length,
  };
  assert.deepEqual(originCounts, { naver_blog: EXPECTED_NAVER, external_web: EXPECTED_EXTERNAL },
    "15.9F must preserve the 15.9E 5/308 origin authority");

  const sample = selectPhase15_9FExternalPilot(withOrigin);
  let networkRequests = 0;
  const countedFetch = async (...args) => {
    networkRequests += 1;
    assert.ok(networkRequests <= MAX_NETWORK_REQUESTS, "15.9F exceeded bounded network request budget");
    return fetch(...args);
  };

  const results = [];
  for (const record of sample) {
    const full = await fetchSourceFullContext(record.signal, {
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      fetchImpl: countedFetch,
      timeoutMs: 12_000,
    });
    results.push({
      rejection_stratum: record.admission.reason_codes[0],
      source_identity_sha256: record.signal.external_content_id,
      source_content_sha256: record.signal.content_hash,
      origin_host_sha256: sha256(record.origin.host),
      fetch_status: full.status,
      error_code: full.error_code,
      fetch_version: full.version,
      dispatch_version: full.dispatch_version,
      extraction_scope: full.extraction_scope ?? null,
      full_context_hash: full.content_hash,
      full_context_chars: full.original_char_count,
      truncated: full.truncated,
      redirect_count: full.redirect_count ?? 0,
      http_status: full.http_status,
    });
  }

  const summary = summarizePhase15_9F(results);
  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9F is read-only and must not mutate governed tables");
  assert.equal(results.length, PHASE15_9F_SAMPLE_SIZE);
  assert.equal(new Set(results.map((item) => item.source_identity_sha256)).size, PHASE15_9F_SAMPLE_SIZE);
  assert.ok(networkRequests <= MAX_NETWORK_REQUESTS);

  const perStratum = Object.fromEntries(PHASE15_9D_REJECTION_STRATA.map((reason) => [
    reason,
    results.filter((item) => item.rejection_stratum === reason).length,
  ]));
  assert.equal(Object.values(perStratum).every((count) => count === 4), true);

  const artifact = {
    phase: "15.9F",
    version: PHASE15_9F_VERSION,
    authority: "bounded_external_web_full_context_acquisition_pilot_only",
    source_campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
    reconstructed_reject_cohort: cohort.length,
    blind_overlap_before_url_read: blindOverlap,
    origin_authority: originCounts,
    sample_size: sample.length,
    sample_per_stratum: perStratum,
    acquisition_summary: summary,
    network_requests: networkRequests,
    max_network_requests: MAX_NETWORK_REQUESTS,
    database_before: before,
    database_after: after,
    database_writes: 0,
    external_model_calls: 0,
    source_admission_mutation_authorized: false,
    incident_creation_authorized: false,
    source_incident_link_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
    results,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "canonical_url",
    "source_signal_id",
    "author_handle",
    "raw_text",
    "content_text",
    "evidence_quote",
    "incident_id",
    "public_problem_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `15.9F artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "EXTERNAL_WEB_FULL_CONTEXT_PILOT_COMPLETE",
    version: PHASE15_9F_VERSION,
    sample_size: sample.length,
    acquisition_summary: summary,
    network_requests: networkRequests,
    database_writes: 0,
    model_calls: 0,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9F] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
