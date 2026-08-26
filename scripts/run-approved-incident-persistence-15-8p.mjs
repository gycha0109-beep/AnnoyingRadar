import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  buildPhase15_8PApprovedPersistencePlan,
  PHASE15_8P_CANDIDATE_FINGERPRINT,
  PHASE15_8P_PROBLEM_SIGNATURE,
  PHASE15_8P_SOURCE_BATCH_VERSION,
} from "../lib/sources/source-approved-incident-persistence.mjs";
import { fingerprintSourceSignalIds } from "../lib/sources/source-incident-curator-packet.mjs";
import { buildIncidentAwareProblemClusters } from "../lib/sources/source-problem-formation.mjs";

const EXPECTED_BATCH_ROWS = 82;
const EXPECTED_CANDIDATES = 8;
const EXPECTED_REJECTS = 66;
const EXPECTED_REVIEWS = 8;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8p-approved-incident-persistence.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotDomains(client) {
  const [
    signals,
    observations,
    ingestionRuns,
    rawInputs,
    painEvidence,
    publicProblems,
    publicEvidence,
    incidents,
    incidentLinks,
    outcomes,
  ] = await Promise.all([
    countRows(client, "ar_source_signals"),
    countRows(client, "ar_source_signal_observations"),
    countRows(client, "ar_source_ingestion_runs"),
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
    countRows(client, "ar_public_problem_evidence_snapshots"),
    countRows(client, "ar_source_incidents"),
    countRows(client, "ar_source_incident_links"),
    countRows(client, "ar_source_full_context_resolution_outcomes"),
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
    source_incident_links: incidentLinks,
    full_context_outcomes: outcomes,
  };
}

async function loadMBOutcomes(client) {
  const { data, error } = await client
    .from("ar_source_full_context_resolution_outcomes")
    .select("source_signal_id, status, decision")
    .eq("batch_version", PHASE15_8P_SOURCE_BATCH_VERSION)
    .order("source_signal_id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner")
    .order("user_id", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 1, "Phase 15.8P requires exactly one Radar owner curator");
  return data[0].user_id;
}

async function loadTargetIncidents(client, incidentKeys) {
  const { data, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key, label")
    .in("incident_key", incidentKeys)
    .order("incident_key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadTargetLinks(client, sourceIds) {
  const { data, error } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .in("source_signal_id", sourceIds)
    .order("source_signal_id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function buildApprovedCluster(plan) {
  const rows = plan.approved_sources.map((item) => ({
    formation_state: "eligible",
    source_signal_id: item.source_signal_id,
    incident_key: item.incident_key,
    problem_signature: plan.problem_signature,
  }));
  const clusters = buildIncidentAwareProblemClusters(rows);
  assert.equal(clusters.length, 1, "approved P decisions must produce exactly one repeated mechanism cluster");
  const cluster = clusters[0];
  assert.equal(cluster.problem_signature, PHASE15_8P_PROBLEM_SIGNATURE);
  assert.equal(cluster.source_count, 2);
  assert.equal(cluster.incident_count, 2);
  assert.equal(cluster.repeat_eligible, true);
  return cluster;
}

function assertOnlyIncidentMutation(before, after) {
  for (const key of [
    "source_signals",
    "source_observations",
    "source_ingestion_runs",
    "raw_inputs",
    "pain_evidences",
    "public_problems",
    "public_evidence",
    "full_context_outcomes",
  ]) {
    assert.equal(after[key], before[key], `Phase 15.8P must not mutate ${key}`);
  }
  assert.equal(after.source_incidents, before.source_incidents + 2, "Phase 15.8P must create exactly two Incidents");
  assert.equal(after.source_incident_links, before.source_incident_links + 2, "Phase 15.8P must create exactly two Source→Incident links");
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();

  const outcomes = await loadMBOutcomes(client);
  assert.equal(outcomes.length, EXPECTED_BATCH_ROWS, "M-B durable outcome count drifted");
  const candidates = outcomes.filter((row) => row.decision === "candidate");
  assert.equal(candidates.length, EXPECTED_CANDIDATES, "M-B Candidate count drifted");
  assert.equal(outcomes.filter((row) => row.decision === "reject").length, EXPECTED_REJECTS, "M-B Reject count drifted");
  assert.equal(outcomes.filter((row) => row.decision === "review").length, EXPECTED_REVIEWS, "M-B Review count drifted");
  assert.equal(
    fingerprintSourceSignalIds(candidates.map((row) => row.source_signal_id)),
    PHASE15_8P_CANDIDATE_FINGERPRINT,
    "M-B Candidate fingerprint drifted",
  );

  const plan = buildPhase15_8PApprovedPersistencePlan(candidates);
  const cluster = buildApprovedCluster(plan);
  const sourceIds = plan.approved_sources.map((item) => item.source_signal_id);
  const incidentKeys = plan.approved_sources.map((item) => item.incident_key);

  const [existingTargets, existingLinks] = await Promise.all([
    loadTargetIncidents(client, incidentKeys),
    loadTargetLinks(client, sourceIds),
  ]);
  assert.equal(existingTargets.length, 0, "approved new Incident keys must not already exist");
  assert.equal(existingLinks.length, 0, "approved Sources must not already have Incident identity");

  const before = await snapshotDomains(client);
  const manifest = {
    phase: "15.8P",
    approval_version: plan.approval_version,
    problem_signature: plan.problem_signature,
    same_problem_mechanism: plan.same_problem_mechanism,
    approved_source_count: plan.approved_sources.length,
    incident_create_count: 2,
    source_incident_link_create_count: 2,
    atomic_rpc_calls: 1,
    mobile_singleton_persistence_authorized: false,
    canonical_problem_persistence_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
    expected_cluster: {
      source_count: cluster.source_count,
      incident_count: cluster.incident_count,
      repeat_eligible: cluster.repeat_eligible,
    },
  };

  if (!live) {
    console.log(JSON.stringify({ status: "ESTIMATE_ONLY", manifest, database_before: before }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_APPROVED_INCIDENT_PERSISTENCE,
    "true",
    "live Phase 15.8P requires ALLOW_APPROVED_INCIDENT_PERSISTENCE=true",
  );

  const curatorUserId = await loadOwnerCurator(client);
  const registrationBatch = plan.approved_sources.map((item) => ({
    incident_key: item.incident_key,
    label: item.incident_label,
    source_signal_ids: [item.source_signal_id],
  }));

  const { data: registrationResult, error: registrationError } = await client.rpc(
    "ar_register_source_incident_batch",
    {
      p_curator_user_id: curatorUserId,
      p_incidents: registrationBatch,
    },
  );
  if (registrationError) throw registrationError;
  assert.ok(Array.isArray(registrationResult), "batch registration must return an array");
  assert.equal(registrationResult.length, 2, "batch registration must return exactly two Incidents");

  const [persistedIncidents, persistedLinks, after] = await Promise.all([
    loadTargetIncidents(client, incidentKeys),
    loadTargetLinks(client, sourceIds),
    snapshotDomains(client),
  ]);
  assert.equal(persistedIncidents.length, 2, "both approved Incidents must persist");
  assert.equal(persistedLinks.length, 2, "both approved Source→Incident links must persist");

  const incidentIdByKey = new Map(persistedIncidents.map((item) => [item.incident_key, item.id]));
  for (const item of plan.approved_sources) {
    const expectedIncidentId = incidentIdByKey.get(item.incident_key);
    assert.ok(expectedIncidentId, "approved Incident key readback failed");
    assert.ok(
      persistedLinks.some((link) => link.source_signal_id === item.source_signal_id && link.incident_id === expectedIncidentId),
      "approved Source must be linked to its curator-approved Incident",
    );
  }

  assertOnlyIncidentMutation(before, after);
  const persistedCluster = buildApprovedCluster(plan);

  const artifact = {
    authority: "approved_incident_persistence_readback",
    manifest,
    incident_keys: [...incidentKeys].sort(),
    database_before: before,
    database_after: after,
    persisted_incident_count: persistedIncidents.length,
    persisted_link_count: persistedLinks.length,
    cluster: {
      problem_signature: persistedCluster.problem_signature,
      source_count: persistedCluster.source_count,
      incident_count: persistedCluster.incident_count,
      repeat_eligible: persistedCluster.repeat_eligible,
    },
    source_signal_ids_emitted: false,
    canonical_problem_created: false,
    public_evidence_created: false,
    publication_performed: false,
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "APPROVED_INCIDENT_PERSISTENCE_COMPLETE",
    problem_signature: plan.problem_signature,
    incidents_created: 2,
    source_incident_links_created: 2,
    repeat_eligible: true,
    canonical_problem_created: false,
    public_evidence_created: false,
    publication_performed: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8P] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
