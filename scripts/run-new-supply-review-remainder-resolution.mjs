import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createServiceClient } from "../lib/supabase/service.js";
import { reconstructExactNewSourceRecords, summarizeReviewSample } from "../lib/sources/new-review-sampling.mjs";
import {
  PHASE15_8M_B_BATCH_VERSION,
  PHASE15_8M_B_EXPECTED_REMAINDER,
  PHASE15_8M_B_EXPECTED_REVIEWS,
  PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT,
  PHASE15_8M_B_SAMPLE_SIZE,
  selectPhase15_8MBRemainder,
} from "../lib/sources/new-supply-review-remainder.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  getSourceFullContextProviderConfig,
} from "../lib/sources/source-full-context-resolution.mjs";
import { resolveSourceAdmissionWithFullContextRecovery } from "../lib/sources/source-full-context-recovery.mjs";
import {
  buildSourceFullContextOutcomeRow,
  SOURCE_FULL_CONTEXT_OUTCOME_TABLE,
} from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { persistSourceFullContextOutcomeRows } from "../lib/sources/source-full-context-outcome-batch.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const OBSERVATION_PAGE_SIZE = 1000;

const PHASE15_8J_COMPLETED_FROM = "2026-08-25T05:15:33.082Z";
const PHASE15_8J_COMPLETED_TO = "2026-08-25T05:16:33.738Z";
const EXPECTED_RUNS = 24;
const EXPECTED_FETCHED = 1157;
const EXPECTED_EXACT_NEW = 985;
const EXPECTED_DUPLICATES = 91;
const EXPECTED_NEW_CANDIDATES = 3;
const EXPECTED_NEW_REJECTS = 852;
const EXPECTED_RUN_FINGERPRINT = "df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df";
const PROVIDER_ONLY_RECOVERY_CODES = Object.freeze(["source_full_context_provider_incomplete"]);

function fingerprint(values) {
  return createHash("sha256").update([...values].map(String).sort().join("\n")).digest("hex");
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countBatchRows(client) {
  const { count, error } = await client
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("batch_version", PHASE15_8M_B_BATCH_VERSION);
  if (error) throw error;
  return count ?? 0;
}

async function snapshotProtectedDomains(client) {
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

async function reconstructRemainder(client) {
  const runs = await loadPhase15_8JRuns(client);
  assert.equal(runs.length, EXPECTED_RUNS, "15.8J exact run count drifted");
  assert.equal(fingerprint(runs.map((run) => run.id)), EXPECTED_RUN_FINGERPRINT, "15.8J run fingerprint drifted");
  assert.equal(sumRuns(runs, "fetched_count"), EXPECTED_FETCHED, "15.8J fetched telemetry drifted");
  assert.equal(sumRuns(runs, "inserted_count"), EXPECTED_EXACT_NEW, "15.8J inserted telemetry drifted");
  assert.equal(sumRuns(runs, "duplicate_count"), EXPECTED_DUPLICATES, "15.8J duplicate telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_candidate_count"), EXPECTED_NEW_CANDIDATES, "15.8J Candidate telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_review_count"), PHASE15_8M_B_EXPECTED_REVIEWS, "15.8J Review telemetry drifted");
  assert.equal(sumRuns(runs, "new_admission_reject_count"), EXPECTED_NEW_REJECTS, "15.8J Reject telemetry drifted");

  const observations = await loadObservations(client, runs.map((run) => run.id));
  const signals = await loadSignals(client, [...new Set(observations.map((row) => row.source_signal_id))]);
  const exactNew = reconstructExactNewSourceRecords({ runs, observations, signals });
  assert.equal(exactNew.length, EXPECTED_EXACT_NEW, "15.8J exact-new reconstruction drifted");

  const reviewQueue = exactNew
    .map((record) => ({ ...record, admission: classifySourceAdmission(record.signal) }))
    .filter((record) => record.admission.decision === "review" && record.admission.requires_full_context);
  assert.equal(reviewQueue.length, PHASE15_8M_B_EXPECTED_REVIEWS, "15.8J exact-new Review reconstruction drifted");

  const selected = selectPhase15_8MBRemainder(reviewQueue);
  assert.equal(selected.sampleFingerprint, PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT, "15.8K sample fingerprint drifted");
  assert.equal(selected.sample.length, PHASE15_8M_B_SAMPLE_SIZE, "15.8K calibration sample must remain 48");
  assert.equal(selected.remainder.length, PHASE15_8M_B_EXPECTED_REMAINDER, "15.8M-B remainder must remain 82");
  return { runs, exactNew, reviewQueue, ...selected };
}

function emptySummary() {
  return { total: 0, candidate: 0, reject: 0, review: 0, resolved: 0, unresolved: 0 };
}

function addOutcome(summary, row) {
  summary.total += 1;
  summary[row.decision] += 1;
  summary[row.status] += 1;
}

function addGroupedOutcome(groups, key, row) {
  const normalized = String(key ?? "unknown");
  const summary = groups[normalized] ?? emptySummary();
  addOutcome(summary, row);
  groups[normalized] = summary;
}

function addReasonCodes(counts, row) {
  for (const code of row.reason_codes ?? []) counts[code] = (counts[code] ?? 0) + 1;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

async function loadBatchReadback(client) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + OBSERVATION_PAGE_SIZE - 1;
    const { data, error } = await client
      .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
      .select("source_signal_id, status, decision, reason_codes, recovery_attempted, recovery_recovered, recovery_trigger_reason_code, recovery_terminal_reason_code")
      .eq("batch_version", PHASE15_8M_B_BATCH_VERSION)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < OBSERVATION_PAGE_SIZE) break;
    from += OBSERVATION_PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const live = process.argv.includes("--live");
  const client = createServiceClient();
  const reconstructed = await reconstructRemainder(client);

  const manifest = {
    phase: "15.8M-B",
    batch_version: PHASE15_8M_B_BATCH_VERSION,
    phase15_8j_completed_from: PHASE15_8J_COMPLETED_FROM,
    phase15_8j_completed_to: PHASE15_8J_COMPLETED_TO,
    phase15_8j_run_fingerprint: EXPECTED_RUN_FINGERPRINT,
    exact_runs: reconstructed.runs.length,
    exact_new_sources: reconstructed.exactNew.length,
    exact_new_reviews: reconstructed.reviewQueue.length,
    calibration_sample_size: reconstructed.sample.length,
    calibration_sample_fingerprint: reconstructed.sampleFingerprint,
    remainder_count: reconstructed.remainder.length,
    remainder_fingerprint: reconstructed.remainderFingerprint,
    remainder_distribution: summarizeReviewSample(reconstructed.remainder),
    recovery_eligible_reason_codes: PROVIDER_ONLY_RECOVERY_CODES,
    individual_source_identities_emitted: false,
  };

  if (!live) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      manifest,
      public_full_context_fetches_max: PHASE15_8M_B_EXPECTED_REMAINDER,
      paid_external_model_calls_max: PHASE15_8M_B_EXPECTED_REMAINDER * 2,
      database_write_statements: 0,
      outcome_rows_inserted: 0,
      explicit_blind_evaluation_reads: 0,
      formation_authority_granted: false,
      publication_authority_granted: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT, "true", "Live 15.8M-B requires paid full-context opt-in");
  assert.ok(String(process.env.OPENAI_API_KEY ?? "").trim(), "Live 15.8M-B requires OpenAI provider configuration");
  const providerConfig = getSourceFullContextProviderConfig(process.env);

  const existingBatchRows = await countBatchRows(client);
  assert.equal(existingBatchRows, 0, "15.8M-B batch version already has durable outcomes; use a new batch version instead of rerunning");

  const protectedBefore = await snapshotProtectedDomains(client);
  const outcomeTotalBefore = await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);

  const safeRows = [];
  const summary = emptySummary();
  const outcomesByDomain = {};
  const outcomesByFamily = {};
  const outcomesByAllocationMode = {};
  const reasonCodeCounts = {};
  let providerRecoveryAttempted = 0;
  let providerRecovered = 0;
  let providerRecoveryExhausted = 0;
  let quoteRecoveryAttempted = 0;

  for (let index = 0; index < reconstructed.remainder.length; index += 1) {
    const record = reconstructed.remainder[index];
    const result = await resolveSourceAdmissionWithFullContextRecovery(record.signal, {
      eligibleReasonCodes: PROVIDER_ONLY_RECOVERY_CODES,
    });
    const row = buildSourceFullContextOutcomeRow({
      batchVersion: PHASE15_8M_B_BATCH_VERSION,
      sourceSignalId: record.signal.id,
      result,
      configuredModel: providerConfig.model,
    });
    safeRows.push(row);

    addOutcome(summary, row);
    addGroupedOutcome(outcomesByDomain, record.domain, row);
    addGroupedOutcome(outcomesByFamily, record.family, row);
    addGroupedOutcome(outcomesByAllocationMode, record.allocation_mode, row);
    addReasonCodes(reasonCodeCounts, row);
    if (row.recovery_attempted) providerRecoveryAttempted += 1;
    if (row.recovery_recovered) providerRecovered += 1;
    if (row.recovery_attempted && !row.recovery_recovered) providerRecoveryExhausted += 1;
    if (row.recovery_trigger_reason_code === "source_full_context_invalid_evidence_quote") quoteRecoveryAttempted += 1;

    console.log(
      `[remainder-resolution] ${index + 1}/${PHASE15_8M_B_EXPECTED_REMAINDER} status=${row.status} decision=${row.decision} retry_attempted=${row.recovery_attempted} retry_recovered=${row.recovery_recovered}`,
    );
  }

  assert.equal(safeRows.length, PHASE15_8M_B_EXPECTED_REMAINDER, "all 82 outcomes must be built before persistence");
  assert.equal(new Set(safeRows.map((row) => row.source_signal_id)).size, PHASE15_8M_B_EXPECTED_REMAINDER, "safe outcome rows must cover 82 unique Sources");
  assert.equal(quoteRecoveryAttempted, 0, "15.8M-B must never retry invalid evidence quotes");

  const protectedAfterResolution = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfterResolution, protectedBefore, "full-context resolution must not mutate protected domains before persistence");
  assert.equal(await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE), outcomeTotalBefore, "no outcome row may be written before the final bulk insert");
  assert.equal(await countBatchRows(client), 0, "authoritative 15.8M-B batch must remain empty until all 82 safe rows are ready");

  const persisted = await persistSourceFullContextOutcomeRows({
    client,
    rows: safeRows,
    expectedBatchVersion: PHASE15_8M_B_BATCH_VERSION,
    expectedCount: PHASE15_8M_B_EXPECTED_REMAINDER,
  });
  assert.equal(persisted.length, PHASE15_8M_B_EXPECTED_REMAINDER, "single bulk insert must persist all 82 rows");

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "15.8M-B must leave protected DB domains unchanged");
  assert.equal(await countRows(client, SOURCE_FULL_CONTEXT_OUTCOME_TABLE), outcomeTotalBefore + PHASE15_8M_B_EXPECTED_REMAINDER, "only the 82 M-B outcome rows may be added");
  assert.equal(await countBatchRows(client), PHASE15_8M_B_EXPECTED_REMAINDER, "15.8M-B durable batch must contain exactly 82 rows");

  const readback = await loadBatchReadback(client);
  assert.equal(readback.length, PHASE15_8M_B_EXPECTED_REMAINDER, "independent batch readback must contain exactly 82 outcomes");
  assert.equal(new Set(readback.map((row) => row.source_signal_id)).size, PHASE15_8M_B_EXPECTED_REMAINDER, "independent readback must contain 82 unique Source identities");

  const readbackSummary = emptySummary();
  const readbackReasons = {};
  for (const row of readback) {
    addOutcome(readbackSummary, row);
    addReasonCodes(readbackReasons, row);
  }
  assert.deepEqual(readbackSummary, summary, "durable readback decision summary must match in-memory safe rows");
  assert.deepEqual(sortedObject(readbackReasons), sortedObject(reasonCodeCounts), "durable readback reasons must match in-memory safe rows");

  console.log(JSON.stringify({
    status: summary.unresolved === 0 ? "COMPLETE" : "COMPLETE_WITH_UNRESOLVED",
    manifest,
    summary,
    promotion_rate_conservative: summary.total > 0 ? summary.candidate / summary.total : 0,
    promotion_rate_resolved_only: summary.resolved > 0 ? summary.candidate / summary.resolved : 0,
    outcomes_by_domain: sortedObject(outcomesByDomain),
    outcomes_by_family: sortedObject(outcomesByFamily),
    outcomes_by_allocation_mode: sortedObject(outcomesByAllocationMode),
    reason_code_counts: sortedObject(reasonCodeCounts),
    provider_recovery_attempted: providerRecoveryAttempted,
    provider_recovered_after_retry: providerRecovered,
    provider_recovery_exhausted: providerRecoveryExhausted,
    quote_recovery_attempted: quoteRecoveryAttempted,
    outcome_table_total_before: outcomeTotalBefore,
    outcome_table_total_after: outcomeTotalBefore + PHASE15_8M_B_EXPECTED_REMAINDER,
    batch_rows_after: readback.length,
    boundary_invariants: {
      before: protectedBefore,
      after_resolution: protectedAfterResolution,
      after_persistence: protectedAfter,
      protected_domains_unchanged: true,
    },
    individual_source_identities_emitted: false,
    database_write_statements: 1,
    outcome_rows_inserted: PHASE15_8M_B_EXPECTED_REMAINDER,
    explicit_blind_evaluation_reads: 0,
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
  console.error(`[remainder-resolution] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
