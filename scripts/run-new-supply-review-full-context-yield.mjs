import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createServiceClient } from "../lib/supabase/service.js";
import { reconstructExactNewSourceRecords, summarizeReviewSample } from "../lib/sources/new-review-sampling.mjs";
import {
  DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE,
  NEW_SUPPLY_REVIEW_SAMPLE_VERSION,
  selectDeterministicNewSupplyReviewSample,
} from "../lib/sources/new-supply-review-sampling.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;

export const PHASE15_8J_COMPLETED_FROM = "2026-08-25T05:15:33.082Z";
export const PHASE15_8J_COMPLETED_TO = "2026-08-25T05:16:33.738Z";
export const PHASE15_8J_EXPECTED_RUNS = 24;
export const PHASE15_8J_EXPECTED_FETCHED = 1157;
export const PHASE15_8J_EXPECTED_NEW_SOURCES = 985;
export const PHASE15_8J_EXPECTED_DUPLICATES = 91;
export const PHASE15_8J_EXPECTED_NEW_CANDIDATES = 3;
export const PHASE15_8J_EXPECTED_NEW_REVIEWS = 130;
export const PHASE15_8J_EXPECTED_NEW_REJECTS = 852;
export const PHASE15_8J_RUN_FINGERPRINT = "df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df";

function parseSampleSize() {
  const prefix = "--sample-size=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE;
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError("sample-size must be an integer from 1 to 100");
  }
  return value;
}

function fingerprint(values) {
  return createHash("sha256")
    .update([...values].map(String).sort().join("\n"))
    .digest("hex");
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

async function loadPhase15_8JRuns(client) {
  const { data, error } = await client
    .from("ar_source_ingestion_runs")
    .select("id, source_platform, query_text, request_metadata, started_at, completed_at, fetched_count, inserted_count, duplicate_count, new_admission_candidate_count, new_admission_review_count, new_admission_reject_count")
    .eq("status", "completed")
    .eq("new_admission_telemetry_version", NEW_SOURCE_ADMISSION_TELEMETRY_VERSION)
    .gte("completed_at", PHASE15_8J_COMPLETED_FROM)
    .lte("completed_at", PHASE15_8J_COMPLETED_TO)
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

function sumRuns(runs, field) {
  return runs.reduce((sum, run) => sum + Number(run[field] ?? 0), 0);
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
  const live = process.argv.includes("--live");
  const estimateOnly = process.argv.includes("--estimate-only") || !live;
  const sampleSize = parseSampleSize();
  const client = createServiceClient();

  const runs = await loadPhase15_8JRuns(client);
  assert.equal(runs.length, PHASE15_8J_EXPECTED_RUNS, "Phase 15.8J exact run count drifted");
  assert.equal(fingerprint(runs.map((run) => run.id)), PHASE15_8J_RUN_FINGERPRINT, "Phase 15.8J run identity fingerprint drifted");
  assert.equal(sumRuns(runs, "fetched_count"), PHASE15_8J_EXPECTED_FETCHED, "Phase 15.8J fetched telemetry drifted");
  assert.equal(sumRuns(runs, "inserted_count"), PHASE15_8J_EXPECTED_NEW_SOURCES, "Phase 15.8J inserted telemetry drifted");
  assert.equal(sumRuns(runs, "duplicate_count"), PHASE15_8J_EXPECTED_DUPLICATES, "Phase 15.8J duplicate telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_candidate_count"), PHASE15_8J_EXPECTED_NEW_CANDIDATES, "Phase 15.8J Candidate telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_review_count"), PHASE15_8J_EXPECTED_NEW_REVIEWS, "Phase 15.8J Review telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_reject_count"), PHASE15_8J_EXPECTED_NEW_REJECTS, "Phase 15.8J Reject telemetry drifted");

  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });
  assert.equal(exactNew.length, PHASE15_8J_EXPECTED_NEW_SOURCES, "Phase 15.8J exact-new reconstruction must remain 985");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, PHASE15_8J_EXPECTED_NEW_REVIEWS, "Phase 15.8J exact-new Review reconstruction must remain 130");

  const sample = selectDeterministicNewSupplyReviewSample(reviewQueue, { sampleSize });
  const manifest = {
    sample_version: NEW_SUPPLY_REVIEW_SAMPLE_VERSION,
    phase15_8j_completed_from: PHASE15_8J_COMPLETED_FROM,
    phase15_8j_completed_to: PHASE15_8J_COMPLETED_TO,
    phase15_8j_run_fingerprint: PHASE15_8J_RUN_FINGERPRINT,
    exact_runs: runs.length,
    exact_new_sources: exactNew.length,
    exact_new_reviews: reviewQueue.length,
    requested_sample_size: sampleSize,
    selected_sample_size: sample.length,
    sample_fingerprint: fingerprint(sample.map((record) => record.signal.id)),
    sample_distribution: summarizeReviewSample(sample),
  };

  if (estimateOnly) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      phase: "15.8K",
      manifest,
      public_full_context_fetches_max: sample.length,
      paid_external_model_calls_max: sample.length,
      individual_source_identities_emitted: false,
      mutation: false,
      blind_evaluation_reads: 0,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT, "true", "Live 15.8K requires ALLOW_PAID_SOURCE_FULL_CONTEXT=true");
  assert.ok(String(process.env.OPENAI_API_KEY ?? "").trim(), "Live 15.8K requires OPENAI_API_KEY");

  const before = await snapshotMutationBoundaries(client);
  const results = [];
  for (let index = 0; index < sample.length; index += 1) {
    const record = sample[index];
    const result = await resolveSourceAdmissionWithFullContext(record.signal);
    results.push({ record, result });
    console.log(`[new-supply-review] ${index + 1}/${sample.length} status=${result.status} decision=${result.decision}`);
  }
  const after = await snapshotMutationBoundaries(client);
  assert.deepEqual(after, before, "Phase 15.8K is read-only and must not mutate database domains");

  const summary = summarizeOutcomes(results);
  console.log(JSON.stringify({
    status: summary.unresolved === 0 ? "COMPLETE" : "COMPLETE_WITH_UNRESOLVED",
    phase: "15.8K",
    manifest,
    summary,
    promotion_rate_conservative: sample.length > 0 ? summary.candidate / sample.length : 0,
    promotion_rate_resolved_only: summary.resolved > 0 ? summary.candidate / summary.resolved : 0,
    outcomes_by_domain: groupedOutcomes(results, "domain"),
    outcomes_by_family: groupedOutcomes(results, "family"),
    outcomes_by_allocation_mode: groupedOutcomes(results, "allocation_mode"),
    reason_code_counts: countReasonCodes(results),
    fetch_status_counts: countFetchStatuses(results),
    boundary_invariants: { before, after, unchanged: true },
    individual_source_identities_emitted: false,
    blind_evaluation_reads: 0,
    database_writes: 0,
    full_source_bodies_persisted: 0,
    formation_authority_granted: false,
    incident_mutations: 0,
    publication_mutations: 0,
    active_allocation_mutations: 0,
    recovery_lane_activated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[new-supply-review] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
