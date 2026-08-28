import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";
import { resolveSignalSourceOrigin } from "../lib/sources/source-origin.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9S";
const VERSION = "phase15.9s-exact-csc-full-context-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c";
const TARGET_SOURCE_CONTENT_SHA256 = "db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4";
const PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const MAX_NETWORK_REQUESTS = 2;
const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9s-exact-csc-full-context.json";
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
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
    ["formation_assessments", "ar_source_formation_assessments"],
    ["curator_decisions", "ar_source_incident_curator_decisions"],
    ["incident_executions", "ar_source_incident_decision_executions"],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
  ];
  const values = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, values[index]]));
}

async function loadExactTarget(client) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, source_origin_kind, source_origin_host, source_origin_classifier_version, first_seen_at, last_seen_at")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9S target Source identity/content hash must resolve uniquely");
  return data[0];
}

async function assertTargetAuthority(client, signal) {
  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "review", "15.9S target must remain REVIEW under deterministic Admission authority");
  assert.equal(admission.requires_full_context, true, "15.9S target must still require full context");

  const origin = resolveSignalSourceOrigin(signal);
  assert.equal(origin?.kind, "naver_blog", "15.9S target must remain a Naver Blog Source");
  assert.equal(signal.content_scope, "search_snippet", "15.9S must start from search-snippet scope");

  const checks = [
    ["ar_source_full_context_resolution_outcomes", "source_signal_id", "full-context outcomes"],
    ["ar_source_incident_links", "source_signal_id", "Incident links"],
    ["ar_public_problem_evidence_snapshots", "source_signal_id", "Public Evidence rows"],
    ["ar_source_signal_evaluation_samples", "source_signal_id", "Blind evaluation rows"],
  ];
  for (const [table, column, label] of checks) {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq(column, signal.id);
    if (error) throw error;
    assert.equal(count ?? 0, 0, `15.9S target must have zero ${label}`);
  }

  const { data: incidentRows, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key, created_from_curator_decision_id")
    .eq("incident_key", PROTECTED_INCIDENT_KEY)
    .limit(2);
  if (incidentError) throw incidentError;
  assert.equal(incidentRows?.length, 1, "15.9S requires exactly one protected CSC Incident");
  assert.notEqual(
    signal.id,
    null,
    "15.9S target must have a durable Source identity",
  );
  return { admission, origin, protectedIncident: incidentRows[0] };
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: VERSION,
      source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
      source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
      target_count: 1,
      max_network_requests: MAX_NETWORK_REQUESTS,
      database_writes: 0,
      full_context_outcome_persistence_authorized: false,
      formation_persistence_authorized: false,
      incident_mutation_authorized: false,
      public_problem_mutation_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_PHASE15_9S_EXACT_FULL_CONTEXT !== "true") {
    throw new Error("Phase 15.9S live resolution requires ALLOW_PHASE15_9S_EXACT_FULL_CONTEXT=true");
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const client = createServiceClient();
  const before = await snapshot(client);
  const signal = await loadExactTarget(client);
  const authority = await assertTargetAuthority(client, signal);

  let networkRequests = 0;
  const countedFetch = async (...args) => {
    networkRequests += 1;
    assert.ok(networkRequests <= MAX_NETWORK_REQUESTS, "15.9S exceeded its one-source network request budget");
    return fetch(...args);
  };

  const result = await resolveSourceAdmissionWithFullContext(signal, { fetchImpl: countedFetch });
  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9S is read-only and must not mutate governed tables");
  await assertTargetAuthority(client, signal);

  const quote = result.semantic?.evidence_quote ?? null;
  const quoteGrounded = Boolean(
    quote
    && result.full_context?.content_text
    && result.full_context.content_text.includes(quote),
  );

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "exact_source_full_context_resolution_only",
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    admission_decision_before: authority.admission.decision,
    admission_reason_codes_before: authority.admission.reason_codes,
    source_origin_kind: authority.origin.kind,
    status: result.status,
    decision: result.decision,
    resolved: result.resolved,
    reason_codes: result.reason_codes,
    full_context: result.full_context ? {
      fetch_status: result.full_context.status,
      fetch_version: result.full_context.version,
      dispatch_version: result.full_context.dispatch_version,
      extraction_scope: result.full_context.extraction_scope ?? null,
      content_scope: result.full_context.content_scope ?? null,
      content_sha256: result.full_context.content_hash ?? null,
      original_char_count: result.full_context.original_char_count ?? null,
      truncated: Boolean(result.full_context.truncated),
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
    network_requests: networkRequests,
    max_network_requests: MAX_NETWORK_REQUESTS,
    database_before: before,
    database_after: after,
    database_writes: 0,
    full_context_outcome_persistence_authorized: false,
    formation_persistence_authorized: false,
    incident_mutation_authorized: false,
    public_problem_mutation_authorized: false,
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
    "curator_decision_id",
    "public_problem_id",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9S artifact must not expose ${forbidden}`);
  }

  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: result.resolved ? "EXACT_FULL_CONTEXT_RESOLUTION_COMPLETE" : "EXACT_FULL_CONTEXT_RESOLUTION_INCOMPLETE",
    phase: PHASE,
    version: VERSION,
    decision: result.decision,
    resolved: result.resolved,
    reason_codes: result.reason_codes,
    full_context_status: result.full_context?.status ?? null,
    full_context_chars: result.full_context?.original_char_count ?? null,
    full_context_truncated: Boolean(result.full_context?.truncated),
    evidence_quote_grounded: quoteGrounded,
    network_requests: networkRequests,
    database_writes: 0,
    output_path: outputPath(),
  }, null, 2));

  if (!result.resolved) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[15.9S] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
