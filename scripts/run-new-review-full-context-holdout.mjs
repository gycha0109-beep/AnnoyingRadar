import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createServiceClient } from "../lib/supabase/service.js";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import {
  reconstructExactNewSourceRecords,
  selectDeterministicReviewSample,
  summarizeReviewSample,
  NEW_REVIEW_SAMPLE_VERSION,
} from "../lib/sources/new-review-sampling.mjs";
import {
  assertDisjointReviewSamples,
  buildExclusionIds,
  selectDeterministicReviewHoldout,
  DEFAULT_REVIEW_HOLDOUT_SIZE,
  NEW_REVIEW_HOLDOUT_VERSION,
  ORIGINAL_REVIEW_SAMPLE_SIZE,
} from "../lib/sources/new-review-holdout.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;
export const PHASE15_8D_EXACT_RUN_CUTOFF = "2026-08-25T02:29:36.982Z";
export const PHASE15_8D_EXPECTED_EXACT_RUNS = 24;
export const PHASE15_8D_EXPECTED_EXACT_NEW = 961;
export const PHASE15_8D_EXPECTED_REVIEWS = 166;

function parseSampleSize() {
  const prefix = "--sample-size=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return DEFAULT_REVIEW_HOLDOUT_SIZE;
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError("sample-size must be an integer from 1 to 100");
  }
  return value;
}

function sampleFingerprint(records) {
  const ids = (records ?? []).map((record) => String(record.signal.id)).sort();
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotMutationBoundaries(client) {
  const [signals, observations, ingestionRuns, rawInputs, painEvidence, publicProblems, publicEvidence, incidents] = await Promise.all([
    countRows(client, "ar_source_signals"),
    countRows(client, "ar_source_signal_observations"),
    countRows(client, "ar_source_ingestion_runs"),
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
    countRows(client, "ar_public_problem_evidence_snapshots"),
    countRows(client, "ar_source_incidents"),
  ]);
  return {
    source_signals: signals,
    source_observations: observations,
    source_ingestion_runs: ingestionRuns,
    raw_inputs: rawInputs,
    pain_evidences: painEvidence,
    public_problems: publicProblems,
    public_evidence: publicEvidence,
    source_incidents: incidents,
  };
}

async function loadFrozenExactRuns(client) {
  const { data, error } = await client
    .from("ar_source_ingestion_runs")
    .select("id, source_platform, query_text, request_metadata, started_at, completed_at, inserted_count, new_admission_review_count")
    .eq("status", "completed")
    .eq("new_admission_telemetry_version", NEW_SOURCE_ADMISSION_TELEMETRY_VERSION)
    .lte("completed_at", PHASE15_8D_EXACT_RUN_CUTOFF)
    .order("completed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadObservations(client, runIds) {
  const rows = [];
  for (let index = 0; index < runIds.length; index += LOOKUP_CHUNK_SIZE) {
    const ids = runIds.slice(index, index + LOOKUP_CHUNK_SIZE);
    let from = 0;
    while (true) {
      const to = from + OBSERVATION_PAGE_SIZE - 1;
      const { data, error } = await client
        .from("ar_source_signal_observations")
        .select("ingestion_run_id, source_signal_id")
        .in("ingestion_run_id", ids)
        .order("ingestion_run_id", { ascending: true })
        .order("source_signal_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < OBSERVATION_PAGE_SIZE) break;
      from += OBSERVATION_PAGE_SIZE;
    }
  }
  return rows;
}

async function loadSignals(client, signalIds) {
  const rows = [];
  for (let index = 0; index < signalIds.length; index += LOOKUP_CHUNK_SIZE) {
    const ids = signalIds.slice(index, index + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, canonical_url, author_handle, raw_text, source_metadata, published_at, first_seen_at, last_seen_at")
      .in("id", ids);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function summarizeOutcomes(results) {
  const summary = { candidate: 0, reject: 0, review: 0, resolved: 0, unresolved: 0 };
  for (const item of results) {
    summary[item.result.decision] += 1;
    if (item.result.resolved) summary.resolved += 1;
    else summary.unresolved += 1;
  }
  return summary;
}

function groupedOutcomes(results, key) {
  const groups = {};
  for (const item of results) {
    const group = item.record[key] ?? "unknown";
    const current = groups[group] ?? { total: 0, candidate: 0, reject: 0, review: 0, resolved: 0, unresolved: 0 };
    current.total += 1;
    current[item.result.decision] += 1;
    if (item.result.resolved) current.resolved += 1;
    else current.unresolved += 1;
    groups[group] = current;
  }
  return groups;
}

function countReasonCodes(results) {
  const counts = {};
  for (const item of results) {
    for (const code of item.result.reason_codes ?? []) counts[code] = (counts[code] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function countFetchStatuses(results) {
  const counts = {};
  for (const item of results) {
    const status = item.result.full_context?.status ?? "none";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const estimateOnly = process.argv.includes("--estimate-only");
  const live = process.argv.includes("--live");
  const sampleSize = parseSampleSize();
  const client = createServiceClient();

  const runs = await loadFrozenExactRuns(client);
  assert.equal(runs.length, PHASE15_8D_EXPECTED_EXACT_RUNS, "Frozen 15.8D exact run count drifted");

  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });

  const expectedInserted = runs.reduce((sum, run) => sum + Number(run.inserted_count ?? 0), 0);
  const expectedReviews = runs.reduce((sum, run) => sum + Number(run.new_admission_review_count ?? 0), 0);
  assert.equal(expectedInserted, PHASE15_8D_EXPECTED_EXACT_NEW, "Frozen 15.8D inserted telemetry drifted");
  assert.equal(expectedReviews, PHASE15_8D_EXPECTED_REVIEWS, "Frozen 15.8D Review telemetry drifted");
  assert.equal(exactNew.length, PHASE15_8D_EXPECTED_EXACT_NEW, "Frozen exact-new reconstruction must remain 961");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, PHASE15_8D_EXPECTED_REVIEWS, "Frozen exact-new Review reconstruction must remain 166");

  const originalSample = selectDeterministicReviewSample(reviewQueue, { sampleSize: ORIGINAL_REVIEW_SAMPLE_SIZE });
  assert.equal(originalSample.length, ORIGINAL_REVIEW_SAMPLE_SIZE, "Original 15.8D sample must reconstruct to 24");
  const exclusionIds = buildExclusionIds(originalSample);
  const holdoutPool = reviewQueue.filter((record) => !exclusionIds.has(record.signal.id));
  const holdout = selectDeterministicReviewHoldout(holdoutPool, {
    sampleSize: Math.min(sampleSize, holdoutPool.length),
    excludeIds: exclusionIds,
  });
  assertDisjointReviewSamples(originalSample, holdout);
  assert.equal(holdoutPool.length, PHASE15_8D_EXPECTED_REVIEWS - ORIGINAL_REVIEW_SAMPLE_SIZE);

  const manifest = {
    original_sample_version: NEW_REVIEW_SAMPLE_VERSION,
    holdout_version: NEW_REVIEW_HOLDOUT_VERSION,
    frozen_exact_run_cutoff: PHASE15_8D_EXACT_RUN_CUTOFF,
    frozen_exact_runs: runs.length,
    frozen_exact_new_sources: exactNew.length,
    frozen_exact_new_reviews: reviewQueue.length,
    excluded_original_sample_size: originalSample.length,
    holdout_pool_size: holdoutPool.length,
    requested_holdout_size: sampleSize,
    selected_holdout_size: holdout.length,
    original_sample_fingerprint: sampleFingerprint(originalSample),
    holdout_sample_fingerprint: sampleFingerprint(holdout),
    overlap_count: 0,
    holdout_distribution: summarizeReviewSample(holdout),
  };

  if (estimateOnly || !live) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      phase: "15.8F",
      manifest,
      public_full_context_fetches_max: holdout.length,
      paid_external_model_calls_max: holdout.length,
      individual_source_identities_emitted: false,
      mutation: false,
      blind_evaluation_reads: 0,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT, "true", "Live holdout requires ALLOW_PAID_SOURCE_FULL_CONTEXT=true");
  assert.ok(String(process.env.OPENAI_API_KEY ?? "").trim(), "Live holdout requires OPENAI_API_KEY");

  const before = await snapshotMutationBoundaries(client);
  const results = [];
  for (let index = 0; index < holdout.length; index += 1) {
    const record = holdout[index];
    const result = await resolveSourceAdmissionWithFullContext(record.signal);
    results.push({ record, result });
    console.log(`[review-holdout] ${index + 1}/${holdout.length} status=${result.status} decision=${result.decision}`);
  }
  const after = await snapshotMutationBoundaries(client);
  assert.deepEqual(after, before, "Phase 15.8F is read-only and must not mutate database domains");

  const summary = summarizeOutcomes(results);
  const completionStatus = summary.unresolved === 0 ? "COMPLETE" : "COMPLETE_WITH_UNRESOLVED";
  console.log(JSON.stringify({
    status: completionStatus,
    phase: "15.8F",
    manifest,
    summary,
    promotion_rate_conservative: holdout.length > 0 ? summary.candidate / holdout.length : 0,
    promotion_rate_resolved_only: summary.resolved > 0 ? summary.candidate / summary.resolved : 0,
    outcomes_by_domain: groupedOutcomes(results, "domain"),
    outcomes_by_family: groupedOutcomes(results, "family"),
    reason_code_counts: countReasonCodes(results),
    fetch_status_counts: countFetchStatuses(results),
    boundary_invariants: { before, after, unchanged: true },
    individual_source_identities_emitted: false,
    blind_evaluation_reads: 0,
    database_writes: 0,
    full_source_bodies_persisted: 0,
    publication_mutations: 0,
    active_allocation_mutations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[review-holdout] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
