import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { getEvaluationSampleIds } from "../lib/sources/blind-evaluation.mjs";
import { PHASE15_9C_CAMPAIGN_VERSION } from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";
import { selectPhase15_9FExternalPilot } from "../lib/sources/phase15-9f-external-web-pilot.mjs";
import {
  comparePhase15_9GFetches,
  determinePhase15_9GConclusion,
  PHASE15_9G_MAX_MODEL_CALLS,
  PHASE15_9G_REJECTION_STRATA,
  PHASE15_9G_SAMPLE_SIZE,
  PHASE15_9G_VERSION,
  summarizePhase15_9G,
} from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { classifySourceOrigin } from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "../lib/sources/source-full-context-fetch.mjs";
import {
  getSourceFullContextProviderConfig,
  judgeSourceFullContextSemantics,
  resolveFullContextSemantic,
  SOURCE_FULL_CONTEXT_PROMPT_VERSION,
} from "../lib/sources/source-full-context-resolution.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const SOURCE_CHUNK_SIZE = 100;
const EXPECTED_COHORT = 313;
const EXPECTED_NAVER = 5;
const EXPECTED_EXTERNAL = 308;
const MAX_SOURCE_NETWORK_REQUESTS = PHASE15_9G_SAMPLE_SIZE * 2 * 4;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9g-external-semantic-rejection-diagnostics.json";
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
  assert.equal(runs.length, 8, "15.9G requires the authoritative eight-run Phase 15.9C campaign");
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
  assert.equal((data ?? []).length, 351, "15.9G expects 351 Phase 15.9C observations");
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
  assert.equal(cohort.length, EXPECTED_COHORT, "15.9G must reconstruct exactly 313 newly inserted Sources");
  assert.equal(cohort.every((record) => record.admission.decision === "reject"), true,
    "15.9G cohort must remain rejected by current Source Admission authority");
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

function addOrigin(cohort, urlFieldsById) {
  return cohort.map((record) => {
    const fields = urlFieldsById.get(record.signal.id);
    assert.ok(fields?.canonical_url, "15.9G Source must have canonical URL");
    const signal = { ...record.signal, ...fields };
    const origin = classifySourceOrigin(signal.canonical_url);
    assert.ok(origin, "15.9G Source must have classifiable public HTTP(S) origin");
    return { ...record, signal, origin };
  });
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
    prompt_version: semantic.prompt_version,
  };
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: "15.9G",
      version: PHASE15_9G_VERSION,
      sample_size: PHASE15_9G_SAMPLE_SIZE,
      fetches_per_source: 2,
      max_source_network_requests: MAX_SOURCE_NETWORK_REQUESTS,
      max_model_calls: PHASE15_9G_MAX_MODEL_CALLS,
      semantic_prompt_version: SOURCE_FULL_CONTEXT_PROMPT_VERSION,
      database_writes: 0,
      source_admission_mutation_authorized: false,
      incident_creation_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9G_SEMANTIC_REJECTION_DIAGNOSTICS !== "true") {
    throw new Error("Phase 15.9G live diagnostics requires ALLOW_PHASE15_9G_SEMANTIC_REJECTION_DIAGNOSTICS=true");
  }

  const providerConfig = getSourceFullContextProviderConfig(process.env);
  const client = createServiceClient();
  const before = await snapshot(client);
  const runs = await loadCampaignRuns(client);
  const observedIds = await loadObservedIds(client, runs.map((row) => row.id));
  const baseSignals = await loadBaseSignals(client, observedIds);
  const cohort = reconstructNewRejectCohort(baseSignals, runs);

  const blindIds = await getEvaluationSampleIds(client);
  const blindOverlap = cohort.filter((record) => blindIds.has(record.signal.id)).length;
  assert.equal(blindOverlap, 0, "15.9G must prove zero blind overlap before canonical URL/body read");

  const urlFieldsById = await loadUrlFields(client, cohort.map((record) => record.signal.id));
  const withOrigin = addOrigin(cohort, urlFieldsById);
  const originCounts = {
    naver_blog: withOrigin.filter((record) => record.origin.kind === "naver_blog").length,
    external_web: withOrigin.filter((record) => record.origin.kind === "external_web").length,
  };
  assert.deepEqual(originCounts, { naver_blog: EXPECTED_NAVER, external_web: EXPECTED_EXTERNAL },
    "15.9G must preserve 15.9E origin authority");

  const sample = selectPhase15_9FExternalPilot(withOrigin);
  assert.equal(sample.length, PHASE15_9G_SAMPLE_SIZE);

  let sourceNetworkRequests = 0;
  const countedSourceFetch = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS,
      "15.9G exceeded bounded source network request budget");
    return fetch(...args);
  };

  let modelCalls = 0;
  const results = [];
  for (const record of sample) {
    const first = await fetchSourceFullContext(record.signal, {
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      fetchImpl: countedSourceFetch,
      timeoutMs: 12_000,
    });
    const second = await fetchSourceFullContext(record.signal, {
      externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      fetchImpl: countedSourceFetch,
      timeoutMs: 12_000,
    });
    const pair = comparePhase15_9GFetches(first, second);
    const base = {
      rejection_stratum: record.admission.reason_codes[0],
      source_identity_sha256: record.signal.external_content_id,
      source_content_sha256: record.signal.content_hash,
      origin_host_sha256: sha256(record.origin.host),
      fetch_pair_stable: pair.stable,
      fetch_pair_reason: pair.reason,
      first_fetch_status: first.status,
      second_fetch_status: second.status,
      first_fetch_error_code: first.error_code,
      second_fetch_error_code: second.error_code,
      first_context_hash: first.content_hash,
      second_context_hash: second.content_hash,
      first_context_chars: first.original_char_count,
      second_context_chars: second.original_char_count,
      extraction_scope: pair.stable ? first.extraction_scope : null,
      title_sha256: pair.stable ? sha256(first.title ?? "") : null,
    };

    if (!pair.stable) {
      results.push({
        ...base,
        semantic: null,
        full_context_decision: null,
        decision_reason_codes: [pair.reason],
        diagnostic_status: "unavailable",
        model_call_attempted: false,
        model: null,
        usage: null,
      });
      continue;
    }

    try {
      modelCalls += 1;
      assert.ok(modelCalls <= PHASE15_9G_MAX_MODEL_CALLS, "15.9G exceeded model call budget");
      const semantic = await judgeSourceFullContextSemantics({
        title: first.title,
        fullText: first.content_text,
        sourcePlatform: record.origin.kind,
        ...providerConfig,
      });
      const final = resolveFullContextSemantic(semantic);
      results.push({
        ...base,
        semantic: safeSemantic(semantic),
        full_context_decision: final.decision,
        decision_reason_codes: final.reason_codes,
        diagnostic_status: final.decision === "candidate"
          ? "false_negative_confirmed"
          : final.decision === "review"
            ? "false_negative_possible"
            : "policy_consistent",
        model_call_attempted: true,
        model: semantic.model,
        usage: semantic.usage,
      });
    } catch (error) {
      results.push({
        ...base,
        semantic: null,
        full_context_decision: null,
        decision_reason_codes: [typeof error?.code === "string" ? error.code : "full_context_judge_failed"],
        diagnostic_status: "unavailable",
        model_call_attempted: true,
        model: null,
        usage: null,
      });
    }
  }

  const summary = summarizePhase15_9G(results);
  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9G is read-only and must not mutate governed tables");
  assert.equal(results.length, PHASE15_9G_SAMPLE_SIZE);
  assert.equal(new Set(results.map((item) => item.source_identity_sha256)).size, PHASE15_9G_SAMPLE_SIZE);
  assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS);
  assert.ok(modelCalls <= PHASE15_9G_MAX_MODEL_CALLS);

  const perStratum = Object.fromEntries(PHASE15_9G_REJECTION_STRATA.map((reason) => [
    reason,
    results.filter((item) => item.rejection_stratum === reason).length,
  ]));
  assert.equal(Object.values(perStratum).every((count) => count === 4), true,
    "15.9G must diagnose exactly four Sources per frozen rejection stratum");

  const artifact = {
    phase: "15.9G",
    version: PHASE15_9G_VERSION,
    authority: "bounded_read_only_semantic_rejection_diagnostics_only",
    source_campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
    sample_authority: "phase15.9f_deterministic_external_pilot_sample",
    semantic_prompt_version: SOURCE_FULL_CONTEXT_PROMPT_VERSION,
    reconstructed_reject_cohort: cohort.length,
    blind_overlap_before_url_read: blindOverlap,
    origin_authority: originCounts,
    sample_size: sample.length,
    sample_per_stratum: perStratum,
    diagnostic_summary: summary,
    diagnostic_conclusion: determinePhase15_9GConclusion(summary),
    source_network_requests: sourceNetworkRequests,
    max_source_network_requests: MAX_SOURCE_NETWORK_REQUESTS,
    model_calls: modelCalls,
    max_model_calls: PHASE15_9G_MAX_MODEL_CALLS,
    database_before: before,
    database_after: after,
    database_writes: 0,
    full_context_outcome_persistence_authorized: false,
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
    "evidence_quote\"",
    "incident_id",
    "public_problem_id",
    "provider_request_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9G artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "EXTERNAL_SEMANTIC_REJECTION_DIAGNOSTICS_COMPLETE",
    version: PHASE15_9G_VERSION,
    sample_size: sample.length,
    diagnostic_summary: summary,
    diagnostic_conclusion: artifact.diagnostic_conclusion,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_writes: 0,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9G] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
