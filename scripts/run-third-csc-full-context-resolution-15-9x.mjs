import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
  fetchSourceFullContext,
} from "../lib/sources/source-full-context-fetch.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import { resolveSignalSourceOrigin } from "../lib/sources/source-origin.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9X";
const VERSION = "phase15.9x-third-csc-full-context-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "60ca0eebb603aa22bad4f73f31d275d7f37af13b20da5499ca0a041d26c56818";
const TARGET_SOURCE_CONTENT_SHA256 = "a1b35603bfd16782a77edf0b5dba3488e1fc03bf550bb24e4733c8ca0f4d1fc6";
const EXPECTED_ORIGIN_HOST = "conetrue.tistory.com";
const PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const MAX_SOURCE_NETWORK_REQUESTS = 4;
const MAX_MODEL_CALLS = 1;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9x-third-csc-full-context.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countWhere(client, table, column, value) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq(column, value);
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
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
    ["formation_assessments", "ar_source_formation_assessments"],
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadExactTarget(client) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, source_origin_kind, source_origin_host, source_origin_classifier_version, first_seen_at, last_seen_at")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9X exact Source hash pair must resolve uniquely");
  return data[0];
}

async function assertTargetBoundary(client, signal) {
  assert.equal(signal.content_scope, "search_snippet", "15.9X must start from search-snippet authority");
  const origin = resolveSignalSourceOrigin(signal);
  assert.equal(origin?.kind, "external_web", "15.9X target must resolve as external_web");
  assert.equal(origin?.host, EXPECTED_ORIGIN_HOST, "15.9X target origin host drifted");

  for (const [table, label] of [
    ["ar_source_full_context_resolution_outcomes", "durable full-context outcomes"],
    ["ar_source_formation_assessments", "Formation assessments"],
    ["ar_source_incident_links", "Incident links"],
    ["ar_public_problem_evidence_snapshots", "Public Evidence rows"],
    ["ar_source_signal_evaluation_samples", "Blind evaluation rows"],
  ]) {
    assert.equal(await countWhere(client, table, "source_signal_id", signal.id), 0, `15.9X target must have zero ${label}`);
  }

  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .eq("incident_key", PROTECTED_INCIDENT_KEY)
    .limit(2);
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 1, "15.9X requires exactly one existing CSC Incident");
  const incident = incidents[0];
  assert.equal(await countWhere(client, "ar_source_incident_links", "incident_id", incident.id), 2,
    "15.9X requires the closed two-Source existing CSC Incident baseline");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "incident_id", incident.id), 0,
    "15.9X existing CSC Incident must remain outside Public Evidence");

  return { origin, admission: classifySourceAdmission(signal) };
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: VERSION,
      target_source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
      target_source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
      external_web_policy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls_max: MAX_MODEL_CALLS,
      database_writes: 0,
      durable_outcome_authorized: false,
      formation_authorized: false,
      incident_authorized: false,
      public_problem_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9X_THIRD_CSC_FULL_CONTEXT, "true",
    "15.9X live resolution requires explicit technical opt-in");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const client = createServiceClient();
  const before = await snapshot(client);
  const signal = await loadExactTarget(client);
  const authority = await assertTargetBoundary(client, signal);

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9X model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9X source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const fetchContext = (target, { fetchImpl }) => fetchSourceFullContext(target, {
    fetchImpl,
    externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
  });
  const result = await resolveSourceAdmissionWithFullContext(signal, {
    fetchImpl: countedFetch,
    fetchContext,
  });

  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9X is read-only and must not mutate governed tables");
  await assertTargetBoundary(client, signal);

  const quote = result.semantic?.evidence_quote ?? null;
  const quoteGrounded = Boolean(quote && result.full_context?.content_text?.includes(quote));
  const candidateReady = result.status === "resolved" && result.decision === "candidate";
  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "third_independent_csc_source_full_context_resolution_only",
    promotion_gate_before: {
      existing_csc_incident_count: 1,
      existing_csc_source_count: 2,
      minimum_distinct_incidents_required: 2,
      public_problem_draft_ready: false,
      blocking_reason: "distinct_incident_support_missing",
    },
    target_source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    target_source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    admission_before: {
      decision: authority.admission.decision,
      reason_codes: authority.admission.reason_codes,
      requires_full_context: authority.admission.requires_full_context,
    },
    source_origin: {
      kind: authority.origin.kind,
      host: authority.origin.host,
    },
    resolution: {
      status: result.status,
      decision: result.decision,
      resolved: result.resolved,
      reason_codes: result.reason_codes,
      candidate_ready_for_durable_outcome: candidateReady,
    },
    full_context: result.full_context ? {
      fetch_status: result.full_context.status,
      fetch_version: result.full_context.version,
      dispatch_version: result.full_context.dispatch_version ?? null,
      extraction_scope: result.full_context.extraction_scope ?? null,
      content_scope: result.full_context.content_scope ?? null,
      content_sha256: result.full_context.content_hash ?? null,
      original_char_count: result.full_context.original_char_count ?? null,
      truncated: Boolean(result.full_context.truncated),
      redirect_count: result.full_context.redirect_count ?? null,
      http_status: result.full_context.http_status ?? null,
    } : null,
    semantic: result.semantic ? {
      problem_claim: result.semantic.problem_claim,
      experience_actor: result.semantic.experience_actor,
      friction_cause: result.semantic.friction_cause,
      friction_specificity: result.semantic.friction_specificity,
      pain_centrality: result.semantic.pain_centrality,
      content_kind: result.semantic.content_kind,
      evidence_quote_sha256: quote ? sha256(quote) : null,
      evidence_quote_char_count: quote ? quote.length : 0,
      evidence_quote_grounded: quoteGrounded,
      prompt_version: result.semantic.prompt_version,
      provider: result.semantic.provider,
      model: result.semantic.model,
      usage: result.semantic.usage,
    } : null,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_before: before,
    database_after: after,
    database_writes: 0,
    durable_outcome_authorized: false,
    formation_authorized: false,
    incident_authorized: false,
    public_problem_authorized: false,
    public_evidence_authorized: false,
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
    "provider_request_id",
    "incident_id",
    "curator_user_id",
    "public_problem_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9X artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "THIRD_CSC_FULL_CONTEXT_CHECK_COMPLETE",
    phase: PHASE,
    admission_decision: authority.admission.decision,
    decision: result.decision,
    resolved: result.resolved,
    reason_codes: result.reason_codes,
    candidate_ready_for_durable_outcome: candidateReady,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    database_writes: 0,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9X] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
