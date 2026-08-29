import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9AB";
const VERSION = "phase15.9ab-carrier-provisioning-admission-triage-v0.1";
const PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const TARGETS = Object.freeze([
  { source_identity_sha256: "f61b7279959fd1269b0a844318a012a8dec7b1dfb65ee95bf740389e0c3b46dd", source_content_sha256: "eb599e74612d1c2a23e539af07824773af523500421313a6ce767e04a279c892", family: "self_purchased_sim_activation" },
  { source_identity_sha256: "84c9f8c9ef5278de603280f3bcdd958f9d9a813b297c4430c4d793c337781a0e", source_content_sha256: "5bbd03895f7812527b361a014c9222c6d6e9f1d7af109eeaf0e7250665beb414", family: "imported_esim_activation" },
  { source_identity_sha256: "7ff6763ae09d4d04952fe30e074a72952d155e6e5889573cb547947981c1bc89", source_content_sha256: "4ee142cf0651b03b1f146b3167493814b0546d8a450b96ca0ff90b482c65f7c0", family: "retail_activation_delay" },
  { source_identity_sha256: "7efa2da07dd638166409aa205876afc867e0a1b5f313d21353ebc136fbdc82dd", source_content_sha256: "584abab32f3ff7a6edb41ba7c07d7d255d07ca16aa9cc038b4ffbaef3642e825", family: "device_change_activation_gap" },
  { source_identity_sha256: "d16a53eccd7e3d9f39516a7cc680bef76d11e1d15721f5516688422777eec85e", source_content_sha256: "2c753b9968439a723ebd45a4721333ee0cf3910986e65d60969491565e4828a6", family: "network_registration_failure" },
  { source_identity_sha256: "3e745aedcd8b5a52de51893f18a6f59830e7146dc9f2819292e5bc58fa91857e", source_content_sha256: "0d2468c2f957d364e0d43534df2a75aa5394d334093da49014bd91c1accf14b9", family: "post_activation_service_loss" },
  { source_identity_sha256: "307cd19ceed19391222163f87e2bf4ec4d5ab12c33989a19ea67c8753abb9d5e", source_content_sha256: "41d01d4f72f594afb61c9d3d37f124a05eef9b60ae31fc64bb42bb38fc005f3d", family: "imei_activation_mismatch" },
  { source_identity_sha256: "faff633967a082fe3b92ac203570894efe3b2b38b525370cac2e897a7ca0a361", source_content_sha256: "c20710000b59e0a9b15b36feef98698070e09e894239139e3db1a4fa18690e23", family: "sim_replacement_recognition" },
]);

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9ab-carrier-provisioning-admission-triage.json";
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

async function loadExactTargets(client) {
  const identities = TARGETS.map((target) => target.source_identity_sha256);
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, source_origin_kind, source_origin_host, source_origin_classifier_version, first_seen_at, last_seen_at")
    .in("external_content_id", identities)
    .limit(TARGETS.length + 1);
  if (error) throw error;
  assert.equal(data?.length, TARGETS.length, "15.9AB exact target set must resolve to eight unique Sources");

  const byIdentity = new Map(data.map((signal) => [signal.external_content_id, signal]));
  return TARGETS.map((target) => {
    const signal = byIdentity.get(target.source_identity_sha256);
    assert.ok(signal, `15.9AB missing exact Source ${target.source_identity_sha256}`);
    assert.equal(signal.content_hash, target.source_content_sha256, `15.9AB canonical content hash drifted for ${target.family}`);
    assert.equal(signal.source_platform, "naver_blog", `15.9AB target ${target.family} must remain a Naver-acquired Source`);
    return { target, signal };
  });
}

async function assertTargetBoundary(client, signal) {
  for (const [table, label] of [
    ["ar_source_full_context_resolution_outcomes", "durable full-context outcomes"],
    ["ar_source_formation_assessments", "Formation assessments"],
    ["ar_source_incident_links", "Incident links"],
    ["ar_public_problem_evidence_snapshots", "Public Evidence rows"],
  ]) {
    assert.equal(await countWhere(client, table, "source_signal_id", signal.id), 0, `15.9AB target must have zero ${label}`);
  }
}

async function assertProtectedIncidentBaseline(client) {
  const { data: incidents, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .eq("incident_key", PROTECTED_INCIDENT_KEY)
    .limit(2);
  if (error) throw error;
  assert.equal(incidents?.length, 1, "15.9AB requires exactly one existing CSC Incident");
  assert.equal(await countWhere(client, "ar_source_incident_links", "incident_id", incidents[0].id), 2,
    "15.9AB requires the closed two-Source CSC Incident baseline");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "incident_id", incidents[0].id), 0,
    "15.9AB existing CSC Incident must remain outside Public Evidence");
}

function summarize(results) {
  const summary = { total: results.length, candidate: 0, review: 0, reject: 0, full_context_required: 0 };
  for (const result of results) {
    summary[result.admission.decision] += 1;
    if (result.admission.requires_full_context) summary.full_context_required += 1;
  }
  return summary;
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: VERSION,
      exact_target_count: TARGETS.length,
      source_network_requests: 0,
      model_calls: 0,
      database_writes: 0,
      durable_outcome_authorized: false,
      formation_authorized: false,
      incident_authorized: false,
      public_problem_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9AB_CARRIER_PROVISIONING_ADMISSION_TRIAGE, "true",
    "15.9AB live triage requires explicit technical opt-in");

  const client = createServiceClient();
  const before = await snapshot(client);
  await assertProtectedIncidentBaseline(client);
  const exactTargets = await loadExactTargets(client);

  const results = [];
  for (const { target, signal } of exactTargets) {
    await assertTargetBoundary(client, signal);
    const admission = classifySourceAdmission(signal);
    results.push({
      family: target.family,
      source_identity_sha256: target.source_identity_sha256,
      source_content_sha256: target.source_content_sha256,
      published_at: signal.published_at,
      admission: {
        version: admission.version,
        policy_revision: admission.policy_revision,
        decision: admission.decision,
        reason_codes: admission.reason_codes,
        requires_full_context: admission.requires_full_context,
      },
    });
  }

  const after = await snapshot(client);
  assert.deepEqual(after, before, "15.9AB must remain read-only across all governed tables");
  await assertProtectedIncidentBaseline(client);
  for (const { signal } of exactTargets) await assertTargetBoundary(client, signal);

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "exact_existing_source_deterministic_admission_triage_only",
    promotion_gate_before: {
      existing_csc_incident_count: 1,
      existing_csc_source_count: 2,
      minimum_distinct_incidents_required: 2,
      public_problem_draft_ready: false,
      blocking_reason: "distinct_incident_support_missing",
    },
    result_summary: summarize(results),
    results,
    budgets: {
      source_network_requests: 0,
      model_calls: 0,
      database_writes: 0,
    },
    governed_counts_before: before,
    governed_counts_after: after,
    next_authority: "Only exact review/candidate results may advance. No Incident identity or publication authority is granted.",
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(outputPath(), serialized, "utf8");
  console.log(serialized);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
