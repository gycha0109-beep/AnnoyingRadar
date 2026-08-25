import assert from "node:assert/strict";

import { createServiceClient } from "../lib/supabase/service.js";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import {
  reconstructExactNewSourceRecords,
  selectDeterministicReviewSample,
  summarizeReviewSample,
  NEW_REVIEW_SAMPLE_VERSION,
} from "../lib/sources/new-review-sampling.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;
const DEFAULT_SAMPLE_SIZE = 24;

function parseSampleSize() {
  const prefix = "--sample-size=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return DEFAULT_SAMPLE_SIZE;
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError("sample-size must be an integer from 1 to 100");
  }
  return value;
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

async function loadExactRuns(client) {
  const { data, error } = await client
    .from("ar_source_ingestion_runs")
    .select("id, source_platform, query_text, request_metadata, started_at, completed_at, inserted_count, new_admission_review_count")
    .eq("status", "completed")
    .eq("new_admission_telemetry_version", NEW_SOURCE_ADMISSION_TELEMETRY_VERSION)
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

function resultSummary(results) {
  return {
    candidate: results.filter((item) => item.result.decision === "candidate").length,
    reject: results.filter((item) => item.result.decision === "reject").length,
    review: results.filter((item) => item.result.decision === "review").length,
    resolved: results.filter((item) => item.result.resolved).length,
    unresolved: results.filter((item) => !item.result.resolved).length,
  };
}

function groupedOutcomes(results, key) {
  const groups = {};
  for (const item of results) {
    const group = item.record[key] ?? "unknown";
    const current = groups[group] ?? { total: 0, candidate: 0, reject: 0, review: 0 };
    current.total += 1;
    current[item.result.decision] += 1;
    groups[group] = current;
  }
  return groups;
}

async function main() {
  const estimateOnly = process.argv.includes("--estimate-only");
  const live = process.argv.includes("--live");
  const sampleSize = parseSampleSize();
  const paidOptIn = process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT === "true";
  const client = createServiceClient();

  const runs = await loadExactRuns(client);
  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });

  const expectedInserted = runs.reduce((sum, run) => sum + Number(run.inserted_count ?? 0), 0);
  const expectedReviews = runs.reduce((sum, run) => sum + Number(run.new_admission_review_count ?? 0), 0);
  assert.equal(exactNew.length, expectedInserted, "Exact-new identity reconstruction must equal exact inserted telemetry");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, expectedReviews, "Exact-new Review reconstruction must equal exact Review telemetry");

  const sample = selectDeterministicReviewSample(reviewQueue, { sampleSize: Math.min(sampleSize, reviewQueue.length) });
  const manifest = sample.map((record, index) => ({
    sample_index: index + 1,
    source_signal_id: record.signal.id,
    query_key: record.query_key,
    domain: record.domain,
    family: record.family,
    page_start: record.page_start,
    allocation_mode: record.allocation_mode,
    source_platform: record.signal.source_platform,
    canonical_url: record.signal.canonical_url,
  }));

  if (estimateOnly || !live) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      sample_version: NEW_REVIEW_SAMPLE_VERSION,
      exact_runs: runs.length,
      observation_rows: observations.length,
      exact_new_sources: exactNew.length,
      exact_new_reviews: reviewQueue.length,
      requested_sample_size: sampleSize,
      selected_sample_size: sample.length,
      queue_distribution: summarizeReviewSample(reviewQueue),
      sample_distribution: summarizeReviewSample(sample),
      manifest,
      public_full_context_fetches_max: sample.length,
      paid_external_model_calls_max: sample.length,
      mutation: false,
    }, null, 2));
    return;
  }

  assert.equal(paidOptIn, true, "Live resolution requires ALLOW_PAID_SOURCE_FULL_CONTEXT=true");
  const before = await snapshotMutationBoundaries(client);
  const results = [];

  for (const record of sample) {
    const result = await resolveSourceAdmissionWithFullContext(record.signal);
    results.push({ record, result });
    console.log(
      `[new-review-resolution] signal=${record.signal.id} domain=${record.domain} family=${record.family} status=${result.status} decision=${result.decision} reason=${result.reason_codes.join(",")}`,
    );
  }

  const after = await snapshotMutationBoundaries(client);
  assert.deepEqual(after, before, "Phase 15.8D is read-only and must not mutate database domains");

  const summary = resultSummary(results);
  const status = summary.unresolved === 0 ? "PASS" : "CONTINUATION_REQUIRED";
  console.log(JSON.stringify({
    status,
    sample_version: NEW_REVIEW_SAMPLE_VERSION,
    exact_runs: runs.length,
    observation_rows: observations.length,
    exact_new_sources: exactNew.length,
    exact_new_reviews: reviewQueue.length,
    selected_sample_size: sample.length,
    sample_distribution: summarizeReviewSample(sample),
    summary,
    promotion_rate: sample.length > 0 ? summary.candidate / sample.length : 0,
    outcomes_by_domain: groupedOutcomes(results, "domain"),
    outcomes_by_family: groupedOutcomes(results, "family"),
    resolutions: results.map(({ record, result }) => ({
      source_signal_id: record.signal.id,
      query_key: record.query_key,
      domain: record.domain,
      family: record.family,
      canonical_url: record.signal.canonical_url,
      decision: result.decision,
      status: result.status,
      reason_codes: result.reason_codes,
      fetch_status: result.full_context?.status ?? null,
      fetched_char_count: result.full_context?.original_char_count ?? null,
      fetched_truncated: result.full_context?.truncated ?? null,
      semantic: result.semantic ? {
        problem_claim: result.semantic.problem_claim,
        experience_actor: result.semantic.experience_actor,
        friction_cause: result.semantic.friction_cause,
        friction_specificity: result.semantic.friction_specificity,
        pain_centrality: result.semantic.pain_centrality,
        content_kind: result.semantic.content_kind,
        prompt_version: result.semantic.prompt_version,
        provider: result.semantic.provider,
        model: result.semantic.model,
        provider_request_id: result.semantic.provider_request_id,
        usage: result.semantic.usage,
      } : null,
    })),
    boundary_invariants: { before, after, unchanged: true },
    blind_evaluation_reads: 0,
    database_writes: 0,
    full_source_bodies_persisted: 0,
    publication_mutations: 0,
  }, null, 2));

  if (status !== "PASS") process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[new-review-resolution] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
