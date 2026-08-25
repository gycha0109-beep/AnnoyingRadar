import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createServiceClient } from "../lib/supabase/service.js";
import { reconstructExactNewSourceRecords, summarizeReviewSample } from "../lib/sources/new-review-sampling.mjs";
import { selectDeterministicNewSupplyReviewSample } from "../lib/sources/new-supply-review-sampling.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContextRecovery } from "../lib/sources/source-full-context-recovery.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;
const PHASE15_8J_COMPLETED_FROM = "2026-08-25T05:15:33.082Z";
const PHASE15_8J_COMPLETED_TO = "2026-08-25T05:16:33.738Z";
const EXPECTED_RUNS = 24;
const EXPECTED_EXACT_NEW = 985;
const EXPECTED_REVIEWS = 130;
const EXPECTED_RUN_FINGERPRINT = "df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df";
const EXPECTED_SAMPLE_FINGERPRINT = "9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6";
const SAMPLE_SIZE = 48;
const BASELINE_UNRESOLVED_ORDINALS = Object.freeze([5, 8, 10, 15, 17, 19, 20, 26, 28, 29, 41, 44, 45]);
const BASELINE_REASON_COUNTS = Object.freeze({
  source_full_context_provider_incomplete: 10,
  source_full_context_invalid_evidence_quote: 1,
  full_context_url_invalid: 2,
});
const PROVIDER_ONLY_RECOVERY_CODES = Object.freeze(["source_full_context_provider_incomplete"]);

function fingerprint(values) {
  return createHash("sha256").update([...values].map(String).sort().join("\n")).digest("hex");
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
    .select("id, source_platform, query_text, request_metadata, started_at, completed_at, inserted_count, new_admission_review_count")
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

async function reconstructTargets(client) {
  const runs = await loadPhase15_8JRuns(client);
  assert.equal(runs.length, EXPECTED_RUNS, "15.8J exact run count drifted");
  assert.equal(fingerprint(runs.map((run) => run.id)), EXPECTED_RUN_FINGERPRINT, "15.8J run fingerprint drifted");

  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });
  assert.equal(exactNew.length, EXPECTED_EXACT_NEW, "15.8J exact-new reconstruction drifted");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, EXPECTED_REVIEWS, "15.8J Review reconstruction drifted");

  const sample = selectDeterministicNewSupplyReviewSample(reviewQueue, { sampleSize: SAMPLE_SIZE });
  assert.equal(sample.length, SAMPLE_SIZE, "15.8K sample must reconstruct to 48");
  assert.equal(fingerprint(sample.map((record) => record.signal.id)), EXPECTED_SAMPLE_FINGERPRINT, "15.8K sample fingerprint drifted");

  const targets = BASELINE_UNRESOLVED_ORDINALS.map((ordinal) => {
    const record = sample[ordinal - 1];
    assert.ok(record, `Missing 15.8K sample ordinal ${ordinal}`);
    return { ...record, baseline_ordinal: ordinal };
  });
  assert.equal(targets.length, 13);
  return { sample, targets };
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

async function main() {
  const live = process.argv.includes("--live");
  const client = createServiceClient();
  const { targets } = await reconstructTargets(client);

  const manifest = {
    phase: "15.8L",
    baseline_phase: "15.8K",
    baseline_run_id: 32813922410,
    baseline_sample_size: SAMPLE_SIZE,
    baseline_sample_fingerprint: EXPECTED_SAMPLE_FINGERPRINT,
    baseline_unresolved_ordinals: BASELINE_UNRESOLVED_ORDINALS,
    baseline_unresolved_count: BASELINE_UNRESOLVED_ORDINALS.length,
    baseline_reason_counts: BASELINE_REASON_COUNTS,
    recovery_eligible_reason_codes: PROVIDER_ONLY_RECOVERY_CODES,
    target_count: targets.length,
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
      quote_recovery_enabled: false,
      active_resolver_mutations: 0,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT, "true", "Live 15.8L requires paid full-context opt-in");
  assert.ok(String(process.env.OPENAI_API_KEY ?? "").trim(), "Live 15.8L requires OpenAI provider configuration");

  const before = await snapshotMutationBoundaries(client);
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const record = targets[index];
    const result = await resolveSourceAdmissionWithFullContextRecovery(record.signal, {
      eligibleReasonCodes: PROVIDER_ONLY_RECOVERY_CODES,
    });
    results.push({ record, result });
    console.log(
      `[provider-recovery] ${index + 1}/${targets.length} ordinal=${record.baseline_ordinal} status=${result.status} decision=${result.decision} attempted=${result.recovery?.attempted ?? false} recovered=${result.recovery?.recovered ?? false}`,
    );
  }
  const after = await snapshotMutationBoundaries(client);
  assert.deepEqual(after, before, "Phase 15.8L must not mutate database domains");

  const summary = summarizeOutcomes(results);
  const attempted = results.filter((item) => item.result.recovery?.attempted).length;
  const recovered = results.filter((item) => item.result.recovery?.recovered).length;
  const exhausted = results.filter((item) => item.result.recovery?.attempted && !item.result.recovery?.recovered).length;
  const freshResolved = results.filter((item) => !item.result.recovery?.attempted && item.result.resolved).length;
  const quoteRetryAttempted = results.filter(
    (item) => item.result.recovery?.trigger_reason_code === "source_full_context_invalid_evidence_quote",
  ).length;
  assert.equal(quoteRetryAttempted, 0, "15.8L must never retry invalid evidence quotes");

  console.log(JSON.stringify({
    status: summary.unresolved === 0 ? "COMPLETE" : "COMPLETE_WITH_UNRESOLVED",
    manifest,
    summary,
    baseline_unresolved_count: BASELINE_UNRESOLVED_ORDINALS.length,
    unresolved_reduction: BASELINE_UNRESOLVED_ORDINALS.length - summary.unresolved,
    fresh_first_attempt_resolved: freshResolved,
    provider_recovery_attempted: attempted,
    provider_recovered_after_retry: recovered,
    provider_recovery_exhausted: exhausted,
    quote_recovery_attempted: quoteRetryAttempted,
    trigger_reason_counts: countValues(results.map((item) => item.result.recovery?.trigger_reason_code)),
    terminal_recovery_reason_counts: countValues(results.map((item) => item.result.recovery?.terminal_reason_code)),
    final_reason_counts: countValues(results.flatMap((item) => item.result.reason_codes ?? [])),
    outcomes_by_family: groupedOutcomes(results, "family"),
    outcomes_by_allocation_mode: groupedOutcomes(results, "allocation_mode"),
    boundary_invariants: { before, after, unchanged: true },
    individual_source_identities_emitted: false,
    database_writes: 0,
    blind_evaluation_reads: 0,
    full_source_bodies_persisted: 0,
    formation_authority_granted: false,
    incident_mutations: 0,
    publication_mutations: 0,
    active_allocation_mutations: 0,
    active_resolver_mutations: 0,
    provider_recovery_product_activation: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[provider-recovery] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
