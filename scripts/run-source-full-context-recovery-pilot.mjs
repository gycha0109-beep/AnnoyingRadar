import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createServiceClient } from "../lib/supabase/service.js";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContextRecovery } from "../lib/sources/source-full-context-recovery.mjs";
import {
  reconstructExactNewSourceRecords,
  selectDeterministicReviewSample,
  summarizeReviewSample,
} from "../lib/sources/new-review-sampling.mjs";
import {
  buildExclusionIds,
  selectDeterministicReviewHoldout,
  DEFAULT_REVIEW_HOLDOUT_SIZE,
  ORIGINAL_REVIEW_SAMPLE_SIZE,
} from "../lib/sources/new-review-holdout.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;
const FROZEN_EXACT_RUN_CUTOFF = "2026-08-25T02:29:36.982Z";
const EXPECTED_EXACT_RUNS = 24;
const EXPECTED_EXACT_NEW = 961;
const EXPECTED_REVIEWS = 166;
const EXPECTED_HOLDOUT_FINGERPRINT = "30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7";
const BASELINE_UNRESOLVED_INDICES = Object.freeze([7, 10, 12, 13, 17, 24, 28, 44]);
const BASELINE_REASON_COUNTS = Object.freeze({
  source_full_context_provider_incomplete: 5,
  source_full_context_invalid_evidence_quote: 3,
});

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
    .lte("completed_at", FROZEN_EXACT_RUN_CUTOFF)
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

function summarizeOutcomes(results) {
  const summary = { candidate: 0, reject: 0, review: 0, resolved: 0, unresolved: 0 };
  for (const item of results) {
    summary[item.result.decision] += 1;
    if (item.result.resolved) summary.resolved += 1;
    else summary.unresolved += 1;
  }
  return summary;
}

function countValues(values) {
  const counts = {};
  for (const value of values) {
    const key = value ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function reconstructRecoveryTargets(client) {
  const runs = await loadFrozenExactRuns(client);
  assert.equal(runs.length, EXPECTED_EXACT_RUNS, "Frozen exact run count drifted");
  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });
  assert.equal(exactNew.length, EXPECTED_EXACT_NEW, "Frozen exact-new reconstruction drifted");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, EXPECTED_REVIEWS, "Frozen Review reconstruction drifted");

  const originalSample = selectDeterministicReviewSample(reviewQueue, { sampleSize: ORIGINAL_REVIEW_SAMPLE_SIZE });
  const exclusionIds = buildExclusionIds(originalSample);
  const holdoutPool = reviewQueue.filter((record) => !exclusionIds.has(record.signal.id));
  const holdout = selectDeterministicReviewHoldout(holdoutPool, {
    sampleSize: DEFAULT_REVIEW_HOLDOUT_SIZE,
    excludeIds: exclusionIds,
  });
  assert.equal(holdout.length, DEFAULT_REVIEW_HOLDOUT_SIZE, "15.8F holdout must reconstruct to 48");
  assert.equal(sampleFingerprint(holdout), EXPECTED_HOLDOUT_FINGERPRINT, "15.8F holdout fingerprint drifted");

  const targets = BASELINE_UNRESOLVED_INDICES.map((ordinal) => {
    const record = holdout[ordinal - 1];
    assert.ok(record, `Missing holdout ordinal ${ordinal}`);
    return record;
  });
  assert.equal(targets.length, 8);
  return { holdout, targets };
}

async function main() {
  const live = process.argv.includes("--live");
  const client = createServiceClient();
  const { targets } = await reconstructRecoveryTargets(client);

  const manifest = {
    phase: "15.8G",
    baseline_run_id: 32807308702,
    baseline_holdout_size: 48,
    baseline_holdout_fingerprint: EXPECTED_HOLDOUT_FINGERPRINT,
    baseline_unresolved_count: BASELINE_UNRESOLVED_INDICES.length,
    baseline_unresolved_ordinals: BASELINE_UNRESOLVED_INDICES,
    baseline_reason_counts: BASELINE_REASON_COUNTS,
    selected_recovery_target_count: targets.length,
    target_distribution: summarizeReviewSample(targets),
    individual_source_identities_emitted: false,
  };

  if (!live) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      manifest,
      public_full_context_fetches_max: targets.length,
      paid_external_model_calls_max: targets.length * 2,
      database_writes: 0,
      blind_evaluation_reads: 0,
      publication_mutations: 0,
      active_resolver_mutations: 0,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT, "true", "Live recovery pilot requires paid full-context opt-in");
  assert.ok(String(process.env.OPENAI_API_KEY ?? "").trim(), "Live recovery pilot requires OpenAI provider configuration");

  const before = await snapshotMutationBoundaries(client);
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const record = targets[index];
    const result = await resolveSourceAdmissionWithFullContextRecovery(record.signal);
    results.push({ record, result });
    console.log(
      `[semantic-recovery] ${index + 1}/${targets.length} status=${result.status} decision=${result.decision} attempted=${result.recovery?.attempted ?? false} recovered=${result.recovery?.recovered ?? false}`,
    );
  }
  const after = await snapshotMutationBoundaries(client);
  assert.deepEqual(after, before, "Phase 15.8G must not mutate database domains");

  const summary = summarizeOutcomes(results);
  const recoveryAttempted = results.filter((item) => item.result.recovery?.attempted).length;
  const recovered = results.filter((item) => item.result.recovery?.recovered).length;
  const exhausted = results.filter((item) => item.result.recovery?.attempted && !item.result.recovery?.recovered).length;

  console.log(JSON.stringify({
    status: summary.unresolved === 0 ? "COMPLETE" : "COMPLETE_WITH_UNRESOLVED",
    manifest,
    summary,
    baseline_unresolved_count: BASELINE_UNRESOLVED_INDICES.length,
    unresolved_reduction: BASELINE_UNRESOLVED_INDICES.length - summary.unresolved,
    resolution_rate: targets.length > 0 ? summary.resolved / targets.length : 0,
    recovery_attempted: recoveryAttempted,
    recovered_after_retry: recovered,
    recovery_exhausted: exhausted,
    trigger_reason_counts: countValues(results.map((item) => item.result.recovery?.trigger_reason_code)),
    terminal_recovery_reason_counts: countValues(results.map((item) => item.result.recovery?.terminal_reason_code)),
    decision_reason_counts: countValues(results.flatMap((item) => item.result.reason_codes ?? [])),
    outcomes_by_domain: groupedOutcomes(results, "domain"),
    outcomes_by_family: groupedOutcomes(results, "family"),
    boundary_invariants: { before, after, unchanged: true },
    individual_source_identities_emitted: false,
    database_writes: 0,
    blind_evaluation_reads: 0,
    full_source_bodies_persisted: 0,
    publication_mutations: 0,
    active_allocation_mutations: 0,
    active_resolver_mutations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[semantic-recovery] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
