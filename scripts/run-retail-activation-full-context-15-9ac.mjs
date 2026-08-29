import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import { resolveSignalSourceOrigin } from "../lib/sources/source-origin.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9AC";
const VERSION = "phase15.9ac-retail-activation-full-context-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "7ff6763ae09d4d04952fe30e074a72952d155e6e5889573cb547947981c1bc89";
const TARGET_SOURCE_CONTENT_SHA256 = "4ee142cf0651b03b1f146b3167493814b0546d8a450b96ca0ff90b482c65f7c0";
const EXPECTED_ADMISSION_REASON = "title_truncated_complaint_ambiguous";
const PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const MAX_SOURCE_NETWORK_REQUESTS = 1;
const MAX_MODEL_CALLS = 1;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9ac-retail-activation-full-context.json";
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
    ["source_signals", "ar_source_signals"], ["source_observations", "ar_source_signal_observations"],
    ["source_ingestion_runs", "ar_source_ingestion_runs"], ["raw_inputs", "ar_raw_inputs"],
    ["pain_evidences", "ar_pain_evidences"], ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
    ["formation_assessments", "ar_source_formation_assessments"], ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"], ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"], ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"], ["public_feed", "ar_public_problem_feed"],
  ];
  const values = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, values[index]]));
}

async function loadExactTarget(client) {
  const { data, error } = await client.from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, source_origin_kind, source_origin_host, source_origin_classifier_version, first_seen_at, last_seen_at")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9AC target Source identity/content hash must resolve uniquely");
  return data[0];
}

async function assertAuthority(client, signal) {
  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "review", "15.9AC target must remain REVIEW");
  assert.equal(admission.requires_full_context, true, "15.9AC target must still require full context");
  assert.deepEqual(admission.reason_codes, [EXPECTED_ADMISSION_REASON], "15.9AC Admission reason drifted");
  assert.equal(signal.content_scope, "search_snippet", "15.9AC must start from search-snippet scope");
  const origin = resolveSignalSourceOrigin(signal);
  assert.equal(origin?.kind, "naver_blog", "15.9AC target must remain Naver Blog");
  assert.equal(origin?.host, "blog.naver.com", "15.9AC Naver origin host drifted");

  for (const [table, label] of [
    ["ar_source_full_context_resolution_outcomes", "durable full-context outcomes"],
    ["ar_source_formation_assessments", "Formation assessments"],
    ["ar_source_incident_links", "Incident links"],
    ["ar_public_problem_evidence_snapshots", "Public Evidence rows"],
    ["ar_source_signal_evaluation_samples", "Blind evaluation rows"],
  ]) assert.equal(await countWhere(client, table, "source_signal_id", signal.id), 0, `15.9AC target must have zero ${label}`);

  const { data: incidents, error } = await client.from("ar_source_incidents").select("id, incident_key").eq("incident_key", PROTECTED_INCIDENT_KEY).limit(2);
  if (error) throw error;
  assert.equal(incidents?.length, 1, "15.9AC requires exactly one existing CSC Incident");
  assert.equal(await countWhere(client, "ar_source_incident_links", "incident_id", incidents[0].id), 2, "15.9AC requires the closed two-Source CSC baseline");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "incident_id", incidents[0].id), 0, "15.9AC CSC Incident must remain outside Public Evidence");
  return { admission, origin };
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({ status: "PLAN_ONLY", phase: PHASE, version: VERSION,
      source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256, source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS, model_calls_max: MAX_MODEL_CALLS, database_writes: 0,
      durable_outcome_authorized: false, formation_authorized: false, incident_authorized: false,
      public_problem_authorized: false, publication_authorized: false }, null, 2));
    return;
  }
  assert.equal(process.env.ALLOW_PHASE15_9AC_RETAIL_ACTIVATION_FULL_CONTEXT, "true", "15.9AC live resolution requires explicit technical opt-in");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const client = createServiceClient();
  const before = await snapshot(client);
  const signal = await loadExactTarget(client);
  const authority = await assertAuthority(client, signal);

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9AC model-call budget exceeded");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9AC source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const result = await resolveSourceAdmissionWithFullContext(signal, { fetchImpl: countedFetch });
  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9AC is read-only and must not mutate governed tables");
  await assertAuthority(client, signal);

  const quote = result.semantic?.evidence_quote ?? null;
  const quoteGrounded = Boolean(quote && result.full_context?.content_text?.includes(quote));
  const artifact = {
    phase: PHASE, version: VERSION, authority: "exact_retail_activation_source_full_context_resolution_only",
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256, source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    admission_before: { decision: authority.admission.decision, reason_codes: authority.admission.reason_codes, requires_full_context: authority.admission.requires_full_context },
    source_origin_kind: authority.origin.kind, status: result.status, decision: result.decision, resolved: result.resolved, reason_codes: result.reason_codes,
    full_context: result.full_context ? {
      fetch_status: result.full_context.status, fetch_version: result.full_context.version, dispatch_version: result.full_context.dispatch_version,
      extraction_scope: result.full_context.extraction_scope ?? null, content_scope: result.full_context.content_scope ?? null,
      content_sha256: result.full_context.content_hash ?? null, original_char_count: result.full_context.original_char_count ?? null,
      truncated: Boolean(result.full_context.truncated), http_status: result.full_context.http_status ?? null,
    } : null,
    semantic: result.semantic ? {
      problem_claim: result.semantic.problem_claim, experience_actor: result.semantic.experience_actor,
      friction_cause: result.semantic.friction_cause, friction_specificity: result.semantic.friction_specificity,
      pain_centrality: result.semantic.pain_centrality, content_kind: result.semantic.content_kind,
      evidence_quote_sha256: quote ? sha256(quote) : null, evidence_quote_char_count: quote ? quote.length : 0,
      evidence_quote_grounded: quoteGrounded, prompt_version: result.semantic.prompt_version,
      provider: result.semantic.provider, model: result.semantic.model, usage: result.semantic.usage,
    } : null,
    source_network_requests: sourceNetworkRequests, model_calls: modelCalls,
    database_before: before, database_after: after, database_writes: 0,
    durable_outcome_authorized: false, formation_authorized: false, incident_authorized: false,
    public_problem_authorized: false, publication_authorized: false,
  };
  const serialized = JSON.stringify(artifact);
  for (const forbidden of ["source_signal_id", "canonical_url", "author_handle", "raw_text", "content_text", "provider_request_id", "incident_id", "curator_decision_id", "public_problem_id"]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `15.9AC artifact must not expose ${forbidden}`);
  }
  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: result.resolved ? "RETAIL_ACTIVATION_FULL_CONTEXT_COMPLETE" : "RETAIL_ACTIVATION_FULL_CONTEXT_INCOMPLETE",
    phase: PHASE, decision: result.decision, resolved: result.resolved, reason_codes: result.reason_codes,
    full_context_status: result.full_context?.status ?? null, full_context_chars: result.full_context?.original_char_count ?? null,
    evidence_quote_grounded: quoteGrounded, source_network_requests: sourceNetworkRequests, model_calls: modelCalls, database_writes: 0 }, null, 2));
  if (!result.resolved) process.exitCode = 2;
}
main().catch((error) => { console.error(`[15.9AC] failed: ${error?.message ?? error}`); process.exitCode = 1; });
