import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import {
  PHASE15_9D_EXPECTED_REJECT_COHORT,
  PHASE15_9D_REJECTION_STRATA,
  PHASE15_9D_SAMPLE_SIZE,
  PHASE15_9D_SOURCE_CAMPAIGN_VERSION,
  PHASE15_9D_VERSION,
  selectPhase15_9DRejectSample,
  summarizePhase15_9DDiagnostics,
} from "../lib/sources/phase15-9d-rejection-diagnostics.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import {
  getSourceFullContextProviderConfig,
  judgeSourceFullContextSemantics,
  resolveFullContextSemantic,
} from "../lib/sources/source-full-context-resolution.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const SOURCE_CHUNK_SIZE = 100;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function parseOutputPath() {
  const value = process.argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length) : "phase15-9d-telecom-rejection-diagnostics.json";
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
    (row) => row.request_metadata?.expanded_campaign_version === PHASE15_9D_SOURCE_CAMPAIGN_VERSION,
  );
  assert.equal(runs.length, 8, "Phase 15.9D requires the unique eight-run Phase 15.9C campaign");
  assert.equal(new Set(runs.map((row) => row.request_metadata?.expanded_query_key)).size, 8,
    "Phase 15.9D requires eight distinct Phase 15.9C query keys");
  return runs;
}

async function loadCampaignObservedIds(client, runIds) {
  const { data, error } = await client
    .from("ar_source_signal_observations")
    .select("source_signal_id, ingestion_run_id, observed_at")
    .in("ingestion_run_id", runIds)
    .limit(2000);
  if (error) throw error;
  const rows = data ?? [];
  assert.equal(rows.length, 351, "Phase 15.9D expects the authoritative 351 Phase 15.9C observations");
  return [...new Set(rows.map((row) => row.source_signal_id))];
}

async function loadSignalsByIds(client, ids) {
  const signals = [];
  for (let index = 0; index < ids.length; index += SOURCE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + SOURCE_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, first_seen_at, last_seen_at")
      .in("id", chunk);
    if (error) throw error;
    signals.push(...(data ?? []));
  }
  return signals;
}

function reconstructNewRejectCohort(signals, runs) {
  const starts = runs.map((row) => Date.parse(row.started_at)).filter(Number.isFinite);
  const ends = runs.map((row) => Date.parse(row.completed_at)).filter(Number.isFinite);
  assert.equal(starts.length, runs.length, "Phase 15.9D campaign started_at must be complete");
  assert.equal(ends.length, runs.length, "Phase 15.9D campaign completed_at must be complete");
  const lower = Math.min(...starts);
  const upper = Math.max(...ends);

  const cohort = signals
    .filter((signal) => {
      const firstSeen = Date.parse(signal.first_seen_at);
      return Number.isFinite(firstSeen) && firstSeen >= lower && firstSeen <= upper;
    })
    .map((signal) => ({ signal, admission: classifySourceAdmission(signal) }));

  assert.equal(cohort.length, PHASE15_9D_EXPECTED_REJECT_COHORT,
    "Phase 15.9D must reconstruct exactly the 313 newly inserted Phase 15.9C Sources");
  assert.equal(cohort.every((record) => record.admission.decision === "reject"), true,
    "Phase 15.9D source cohort must still be rejected by the current admission authority");
  return cohort;
}

function safeSemantic(semantic) {
  if (!semantic) return null;
  const quote = semantic.evidence_quote ?? null;
  return {
    problem_claim: semantic.problem_claim,
    experience_actor: semantic.experience_actor,
    friction_cause: semantic.friction_cause,
    friction_specificity: semantic.friction_specificity,
    pain_centrality: semantic.pain_centrality,
    content_kind: semantic.content_kind,
    evidence_quote_length: quote ? quote.length : 0,
    evidence_quote_sha256: quote ? sha256(quote) : null,
  };
}

async function diagnoseOne(record, providerConfig) {
  const rejectionStratum = record.admission.reason_codes[0];
  const base = {
    rejection_stratum: rejectionStratum,
    source_platform: record.signal.source_platform,
    source_identity_sha256: record.signal.external_content_id,
    source_content_sha256: record.signal.content_hash,
    published_at: record.signal.published_at,
  };

  const full = await fetchSourceFullContext(record.signal);
  if (full.status !== "resolved" || !full.content_text) {
    return {
      ...base,
      fetch_status: full.status,
      fetch_error_code: full.error_code,
      full_context_hash: null,
      full_context_chars: null,
      full_context_truncated: false,
      semantic: null,
      full_context_decision: null,
      decision_reason_codes: [full.error_code ?? "full_context_unavailable"],
      diagnostic_status: "unavailable",
      model: null,
      usage: null,
    };
  }

  if (full.truncated) {
    return {
      ...base,
      fetch_status: full.status,
      fetch_error_code: null,
      full_context_hash: full.content_hash,
      full_context_chars: full.original_char_count,
      full_context_truncated: true,
      semantic: null,
      full_context_decision: null,
      decision_reason_codes: ["full_context_truncated"],
      diagnostic_status: "unavailable",
      model: null,
      usage: null,
    };
  }

  try {
    const semantic = await judgeSourceFullContextSemantics({
      title: full.title,
      fullText: full.content_text,
      sourcePlatform: record.signal.source_platform,
      ...providerConfig,
    });
    const final = resolveFullContextSemantic(semantic);
    return {
      ...base,
      fetch_status: full.status,
      fetch_error_code: null,
      full_context_hash: full.content_hash,
      full_context_chars: full.original_char_count,
      full_context_truncated: false,
      semantic: safeSemantic(semantic),
      full_context_decision: final.decision,
      decision_reason_codes: final.reason_codes,
      diagnostic_status: final.decision === "candidate"
        ? "false_negative_confirmed"
        : final.decision === "review"
          ? "false_negative_possible"
          : "policy_consistent",
      model: semantic.model,
      usage: semantic.usage,
    };
  } catch (error) {
    return {
      ...base,
      fetch_status: full.status,
      fetch_error_code: null,
      full_context_hash: full.content_hash,
      full_context_chars: full.original_char_count,
      full_context_truncated: false,
      semantic: null,
      full_context_decision: null,
      decision_reason_codes: [typeof error?.code === "string" ? error.code : "full_context_judge_failed"],
      diagnostic_status: "unavailable",
      model: null,
      usage: null,
    };
  }
}

function determineConclusion(summary) {
  if (summary.false_negative_confirmed > 0) return "source_admission_false_negative_detected";
  if (summary.false_negative_possible > 0) return "possible_source_admission_false_negative";
  if (summary.fetched_unavailable > 0) return "diagnostic_inconclusive_due_to_unavailable_context";
  return "sample_supports_search_supply_mismatch";
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9D",
      version: PHASE15_9D_VERSION,
      source_campaign_version: PHASE15_9D_SOURCE_CAMPAIGN_VERSION,
      expected_reject_cohort: PHASE15_9D_EXPECTED_REJECT_COHORT,
      strata: PHASE15_9D_REJECTION_STRATA,
      sample_size: PHASE15_9D_SAMPLE_SIZE,
      database_writes: 0,
      incident_creation_authorized: false,
      problem_signature_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9D_REJECTION_DIAGNOSTICS !== "true") {
    throw new Error("Phase 15.9D live diagnostics requires ALLOW_PHASE15_9D_REJECTION_DIAGNOSTICS=true");
  }

  const providerConfig = getSourceFullContextProviderConfig(process.env);
  const client = createServiceClient();
  const before = await snapshot(client);
  const runs = await loadCampaignRuns(client);
  const runIds = runs.map((row) => row.id);
  const observedIds = await loadCampaignObservedIds(client, runIds);
  const signals = await loadSignalsByIds(client, observedIds);
  const cohort = reconstructNewRejectCohort(signals, runs);
  const excludedSignalIds = await getEvaluationSampleIds(client);
  const blindOverlapCount = cohort.filter((record) => excludedSignalIds.has(record.signal.id)).length;
  const sample = selectPhase15_9DRejectSample(cohort, { excludedSignalIds });

  const results = [];
  for (const record of sample) {
    results.push(await diagnoseOne(record, providerConfig));
  }

  const summary = summarizePhase15_9DDiagnostics(results);
  const after = await snapshot(client);
  assert.deepEqual(after, before, "Phase 15.9D is read-only and must not mutate any governed table");
  assert.equal(results.length, PHASE15_9D_SAMPLE_SIZE);
  assert.equal(new Set(results.map((item) => item.source_identity_sha256)).size, PHASE15_9D_SAMPLE_SIZE);

  const perStratum = Object.fromEntries(PHASE15_9D_REJECTION_STRATA.map((reason) => [
    reason,
    results.filter((item) => item.rejection_stratum === reason).length,
  ]));
  assert.equal(Object.values(perStratum).every((count) => count === 4), true,
    "Phase 15.9D must diagnose exactly four Sources from each rejection stratum");

  const artifact = {
    phase: "15.9D",
    version: PHASE15_9D_VERSION,
    authority: "bounded_rejection_diagnostics_only",
    source_campaign_version: PHASE15_9D_SOURCE_CAMPAIGN_VERSION,
    reconstructed_reject_cohort: cohort.length,
    blind_120_overlap_excluded: blindOverlapCount,
    sample_size: sample.length,
    sample_per_stratum: perStratum,
    diagnostic_summary: summary,
    diagnostic_conclusion: determineConclusion(summary),
    results,
    database_before: before,
    database_after: after,
    database_writes: 0,
    full_source_body_fetch_attempts: sample.length,
    external_model_call_attempts: results.filter((item) => item.semantic !== null || item.decision_reason_codes?.some((code) => String(code).includes("judge"))).length,
    incident_creation_authorized: false,
    source_incident_link_authorized: false,
    problem_signature_authorized: false,
    public_problem_creation_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "evidence_quote\"",
    "incident_id",
    "public_problem_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `Phase 15.9D artifact must not expose ${forbidden}`);
  }

  await writeFile(parseOutputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "TELECOM_REJECTION_DIAGNOSTICS_COMPLETE",
    version: PHASE15_9D_VERSION,
    sample_size: sample.length,
    diagnostic_summary: summary,
    diagnostic_conclusion: artifact.diagnostic_conclusion,
    database_writes: 0,
    output_path: parseOutputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9D] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
