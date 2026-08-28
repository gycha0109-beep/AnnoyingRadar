import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import {
  SOURCE_INCIDENT_CURATOR_DECISION_TABLE,
  recordCuratorIncidentDecision,
} from "../lib/sources/source-incident-curator-decision-service.mjs";
import {
  SOURCE_INCIDENT_DECISION_EXECUTION_TABLE,
  executeApprovedIncidentDecision,
} from "../lib/sources/source-incident-decision-execution-service.mjs";
import { SOURCE_FORMATION_ASSESSMENT_TABLE } from "../lib/sources/source-formation-assessment-persistence.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const PHASE = "15.9W";
const VERSION = "phase15.9w-approved-existing-incident-link-v0.1";
const TARGET_SOURCE_IDENTITY_SHA256 = "b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c";
const TARGET_SOURCE_CONTENT_SHA256 = "db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4";
const TARGET_FORMATION_BATCH_VERSION = "phase15.9v-exact-csc-evidence-grounding-recovery-v0.1";
const TARGET_CONTEXT_SHA256 = "751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540";
const TARGET_CONTEXT_CHAR_COUNT = 3035;
const TARGET_EVIDENCE_SHA256 = "159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9";
const TARGET_EVIDENCE_CHAR_COUNT = 44;
const TARGET_INCIDENT_KEY = "carrier_csc_feature_restriction_case";
const TARGET_INCIDENT_LABEL = "통신사 CSC 변경 후 전용 기능 제한 사례";

const EXPECTED_INCIDENTS_BEFORE = 7;
const EXPECTED_LINKS_BEFORE = 8;
const EXPECTED_DECISIONS_BEFORE = 1;
const EXPECTED_EXECUTIONS_BEFORE = 1;
const EXPECTED_PUBLIC_PROBLEMS = 3;
const EXPECTED_PUBLIC_EVIDENCE = 7;
const EXPECTED_PUBLIC_FEED = 3;
const MAX_SOURCE_NETWORK_REQUESTS = 1;
const MAX_MODEL_CALLS = 0;

function outputPath() {
  const arg = process.argv.find((item) => item.startsWith("--output="));
  return arg ? arg.slice("--output=".length) : "phase15-9w-approved-existing-incident-link.json";
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

async function loadExactSource(client) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id")
    .eq("source_platform", "naver_blog")
    .eq("external_content_id", TARGET_SOURCE_IDENTITY_SHA256)
    .eq("content_hash", TARGET_SOURCE_CONTENT_SHA256)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9W exact Source hash pair must resolve uniquely");
  return data[0];
}

async function loadExactFormation(client, signalId) {
  const { data, error } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, source_signal_id, assessment_batch_version, status, formation_state, resolved, reason_codes, context_content_sha256, context_char_count, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_grounded")
    .eq("source_signal_id", signalId)
    .eq("assessment_batch_version", TARGET_FORMATION_BATCH_VERSION)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9W exact 15.9V Formation must resolve uniquely");
  const row = data[0];
  assert.equal(row.status, "resolved");
  assert.equal(row.formation_state, "eligible");
  assert.equal(row.resolved, true);
  assert.deepEqual(row.reason_codes, ["formation_grounded_external_friction"]);
  assert.equal(row.context_content_sha256, TARGET_CONTEXT_SHA256);
  assert.equal(row.context_char_count, TARGET_CONTEXT_CHAR_COUNT);
  assert.equal(row.evidence_quote_sha256, TARGET_EVIDENCE_SHA256);
  assert.equal(row.evidence_quote_char_count, TARGET_EVIDENCE_CHAR_COUNT);
  assert.equal(row.evidence_quote_grounded, true);
  return row;
}

async function loadExactIncident(client) {
  const { data, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key, label")
    .eq("incident_key", TARGET_INCIDENT_KEY)
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9W approved existing Incident key must resolve uniquely");
  const row = data[0];
  assert.equal(row.label, TARGET_INCIDENT_LABEL);
  return row;
}

async function loadOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner")
    .limit(2);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.9W requires exactly one owner curator authority row");
  return data[0];
}

async function loadDecisionReadback(client, decisionId) {
  const { data, error } = await client
    .from(SOURCE_INCIDENT_CURATOR_DECISION_TABLE)
    .select("id, formation_assessment_id, source_signal_id, reviewed_context_content_sha256, reviewed_context_char_count, reviewed_evidence_quote_sha256, reviewed_evidence_quote_char_count, evidence_decision, incident_action, existing_incident_id, incident_persistence_authorized, decided_by_curator_user_id")
    .eq("id", decisionId)
    .maybeSingle();
  if (error) throw error;
  assert.ok(data, "15.9W durable curator decision readback is required");
  return data;
}

async function loadExecutionReadback(client, executionId) {
  const { data, error } = await client
    .from(SOURCE_INCIDENT_DECISION_EXECUTION_TABLE)
    .select("id, curator_decision_id, source_signal_id, incident_id, incident_action, executed_by_curator_user_id")
    .eq("id", executionId)
    .maybeSingle();
  if (error) throw error;
  assert.ok(data, "15.9W durable execution readback is required");
  return data;
}

async function protectedSnapshot(client) {
  const entries = [
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["curator_decisions", SOURCE_INCIDENT_CURATOR_DECISION_TABLE],
    ["incident_executions", SOURCE_INCIDENT_DECISION_EXECUTION_TABLE],
    ["public_problems", "ar_public_problems"],
    ["public_evidence", "ar_public_problem_evidence_snapshots"],
    ["public_feed", "ar_public_problem_feed"],
  ];
  const counts = await Promise.all(entries.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(entries.map(([key], index) => [key, counts[index]]));
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      phase: PHASE,
      version: VERSION,
      formation_batch_version: TARGET_FORMATION_BATCH_VERSION,
      approved_incident_key: TARGET_INCIDENT_KEY,
      approved_action: "reuse_existing",
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls_max: MAX_MODEL_CALLS,
      expected_database_rpc_calls: 2,
      public_problem_authorized: false,
      publication_authorized: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PHASE15_9W_APPROVED_EXISTING_INCIDENT_LINK, "true",
    "15.9W live execution requires explicit technical opt-in");

  const client = createServiceClient();
  const before = await protectedSnapshot(client);
  assert.deepEqual(before, {
    source_incidents: EXPECTED_INCIDENTS_BEFORE,
    source_incident_links: EXPECTED_LINKS_BEFORE,
    curator_decisions: EXPECTED_DECISIONS_BEFORE,
    incident_executions: EXPECTED_EXECUTIONS_BEFORE,
    public_problems: EXPECTED_PUBLIC_PROBLEMS,
    public_evidence: EXPECTED_PUBLIC_EVIDENCE,
    public_feed: EXPECTED_PUBLIC_FEED,
  }, "15.9W requires the exact closed production baseline");

  const source = await loadExactSource(client);
  const formation = await loadExactFormation(client, source.id);
  const incident = await loadExactIncident(client);
  const curator = await loadOwnerCurator(client);

  assert.equal(await countWhere(client, SOURCE_INCIDENT_CURATOR_DECISION_TABLE, "formation_assessment_id", formation.id), 0,
    "15.9W exact Formation must not already have a curator decision");
  assert.equal(await countWhere(client, "ar_source_incident_links", "source_signal_id", source.id), 0,
    "15.9W exact Source must not already have Incident authority");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "source_signal_id", source.id), 0,
    "15.9W exact Source must not already have Public Evidence authority");
  assert.equal(await countWhere(client, "ar_source_signal_evaluation_samples", "source_signal_id", source.id), 0,
    "15.9W exact Source must remain outside Blind evaluation");

  let sourceNetworkRequests = 0;
  let modelCalls = 0;
  const countedFetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.startsWith("https://api.openai.com/")) {
      modelCalls += 1;
      assert.ok(modelCalls <= MAX_MODEL_CALLS, "15.9W model calls are forbidden");
    } else {
      sourceNetworkRequests += 1;
      assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "15.9W source-network budget exceeded");
    }
    return globalThis.fetch(input, init);
  };

  const decision = await recordCuratorIncidentDecision(client, {
    signalId: source.id,
    formationAssessmentId: formation.id,
    curatorUserId: curator.user_id,
    fetchImpl: countedFetch,
    decision: {
      evidenceDecision: "accept",
      incidentAction: "reuse_existing",
      existingIncidentId: incident.id,
      decisionReason: "Human curator explicitly approved linking the exact recovered eligible Formation to the existing carrier_csc_feature_restriction_case Incident.",
    },
  });

  assert.equal(decision.decision.evidence_decision, "accept");
  assert.equal(decision.decision.incident_action, "reuse_existing");
  assert.equal(decision.decision.existing_incident_id, incident.id);
  assert.equal(decision.decision.incident_persistence_authorized, true);
  assert.equal(decision.reviewed_context.content_sha256, TARGET_CONTEXT_SHA256);
  assert.equal(decision.reviewed_context.char_count, TARGET_CONTEXT_CHAR_COUNT);
  assert.equal(decision.reviewed_evidence.quote_sha256, TARGET_EVIDENCE_SHA256);
  assert.equal(decision.reviewed_evidence.quote_char_count, TARGET_EVIDENCE_CHAR_COUNT);
  assert.equal(sourceNetworkRequests, 1, "15.9W curator packet must revalidate the source exactly once");
  assert.equal(modelCalls, 0, "15.9W must not invoke a model");

  const decisionRow = await loadDecisionReadback(client, decision.decision_id);
  assert.equal(decisionRow.formation_assessment_id, formation.id);
  assert.equal(decisionRow.source_signal_id, source.id);
  assert.equal(decisionRow.reviewed_context_content_sha256, TARGET_CONTEXT_SHA256);
  assert.equal(decisionRow.reviewed_context_char_count, TARGET_CONTEXT_CHAR_COUNT);
  assert.equal(decisionRow.reviewed_evidence_quote_sha256, TARGET_EVIDENCE_SHA256);
  assert.equal(decisionRow.reviewed_evidence_quote_char_count, TARGET_EVIDENCE_CHAR_COUNT);
  assert.equal(decisionRow.evidence_decision, "accept");
  assert.equal(decisionRow.incident_action, "reuse_existing");
  assert.equal(decisionRow.existing_incident_id, incident.id);
  assert.equal(decisionRow.incident_persistence_authorized, true);
  assert.equal(decisionRow.decided_by_curator_user_id, curator.user_id);
  assert.equal(await countWhere(client, "ar_source_incident_links", "source_signal_id", source.id), 0,
    "15.9W durable decision alone must not create the Source→Incident link");

  const execution = await executeApprovedIncidentDecision(client, {
    decisionId: decision.decision_id,
    curatorUserId: curator.user_id,
  });
  assert.equal(execution.curator_decision_id, decision.decision_id);
  assert.equal(execution.source_signal_id, source.id);
  assert.equal(execution.incident_id, incident.id);
  assert.equal(execution.incident_action, "reuse_existing");
  assert.equal(execution.executed_by_curator_user_id, curator.user_id);

  const executionRow = await loadExecutionReadback(client, execution.execution_id);
  assert.equal(executionRow.curator_decision_id, decision.decision_id);
  assert.equal(executionRow.source_signal_id, source.id);
  assert.equal(executionRow.incident_id, incident.id);
  assert.equal(executionRow.incident_action, "reuse_existing");
  assert.equal(executionRow.executed_by_curator_user_id, curator.user_id);

  const after = await protectedSnapshot(client);
  assert.deepEqual(after, {
    source_incidents: EXPECTED_INCIDENTS_BEFORE,
    source_incident_links: EXPECTED_LINKS_BEFORE + 1,
    curator_decisions: EXPECTED_DECISIONS_BEFORE + 1,
    incident_executions: EXPECTED_EXECUTIONS_BEFORE + 1,
    public_problems: EXPECTED_PUBLIC_PROBLEMS,
    public_evidence: EXPECTED_PUBLIC_EVIDENCE,
    public_feed: EXPECTED_PUBLIC_FEED,
  }, "15.9W may add only one decision, one Source→Incident link, and one execution row");

  assert.equal(await countWhere(client, "ar_source_incident_links", "source_signal_id", source.id), 1,
    "15.9W exact Source must end with exactly one Incident link");
  assert.equal(await countWhere(client, "ar_public_problem_evidence_snapshots", "source_signal_id", source.id), 0,
    "15.9W must not create Public Evidence");

  const { data: linkRows, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id, curator_decision_id, linked_by_curator_user_id")
    .eq("source_signal_id", source.id)
    .limit(2);
  if (linkError) throw linkError;
  assert.equal(linkRows?.length, 1);
  assert.equal(linkRows[0].incident_id, incident.id);
  assert.equal(linkRows[0].curator_decision_id, decision.decision_id);
  assert.equal(linkRows[0].linked_by_curator_user_id, curator.user_id);

  const artifact = {
    phase: PHASE,
    version: VERSION,
    authority: "explicit_human_curator_approved_existing_incident_reuse_not_public_authority",
    source_identity_sha256: TARGET_SOURCE_IDENTITY_SHA256,
    source_content_sha256: TARGET_SOURCE_CONTENT_SHA256,
    formation_batch_version: TARGET_FORMATION_BATCH_VERSION,
    reviewed_context_sha256: TARGET_CONTEXT_SHA256,
    reviewed_context_char_count: TARGET_CONTEXT_CHAR_COUNT,
    reviewed_evidence_sha256: TARGET_EVIDENCE_SHA256,
    reviewed_evidence_char_count: TARGET_EVIDENCE_CHAR_COUNT,
    incident_key: TARGET_INCIDENT_KEY,
    incident_label: TARGET_INCIDENT_LABEL,
    decision: {
      evidence_decision: "accept",
      incident_action: "reuse_existing",
      incident_persistence_authorized: true,
      durable_decision_verified: true,
    },
    execution: {
      incident_reused: true,
      source_incident_link_created: true,
      durable_execution_verified: true,
      source_network_requests: sourceNetworkRequests,
      model_calls: modelCalls,
      database_rpc_calls: 2,
    },
    counts: { before, after },
    downstream_authority: {
      public_problem_authorized: false,
      public_evidence_persistence_authorized: false,
      publication_authorized: false,
    },
  };

  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id",
    "formation_assessment_id",
    "curator_user_id",
    "decision_id",
    "execution_id",
    "incident_id",
    "canonical_url",
    "raw_text",
    "content_text",
    "evidence_quote\"",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}`), false, `15.9W artifact must not expose ${forbidden}`);
  }
  await writeFile(outputPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "APPROVED_EXISTING_INCIDENT_REUSE_EXECUTED",
    phase: PHASE,
    incident_key: TARGET_INCIDENT_KEY,
    formation_state: formation.formation_state,
    source_network_requests: sourceNetworkRequests,
    model_calls: modelCalls,
    incident_count_before: before.source_incidents,
    incident_count_after: after.source_incidents,
    link_count_before: before.source_incident_links,
    link_count_after: after.source_incident_links,
    decision_count_before: before.curator_decisions,
    decision_count_after: after.curator_decisions,
    execution_count_before: before.incident_executions,
    execution_count_after: after.incident_executions,
    public_domains_unchanged: true,
    output_path: outputPath(),
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9W] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
