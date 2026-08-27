import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  buildPublicationCuratorPacket,
  PHASE15_8U_EXPECTED_INCIDENT_KEYS,
  PHASE15_8U_PROBLEM_SIGNATURE,
} from "../lib/sources/publication-curator-packet.mjs";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8u-publication-curator-packet.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotDomains(client) {
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

async function loadTargetProblem(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("id, problem_signature, title, summary, target_user, situation, category, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_8U_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.8U requires exactly one Canonical Problem identity");
  const problem = data[0];
  assert.equal(problem.status, "draft", "15.8U requires the target to remain draft");
  assert.equal(problem.published_at, null, "15.8U target must remain unpublished");
  assert.equal(problem.archived_at, null, "15.8U target must remain active");
  return problem;
}

async function loadTargetEvidence(client, problemId) {
  const { data, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("excerpt, publication_basis, source_type, source_label, source_url, source_key, source_signal_id, incident_id, order_index")
    .eq("public_problem_id", problemId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadIncidents(client, incidentIds) {
  const { data, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("id", incidentIds)
    .order("incident_key", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 2, "15.8U requires exactly two persisted Incidents");
  assert.deepEqual(data.map((item) => item.incident_key).sort(), PHASE15_8U_EXPECTED_INCIDENT_KEYS);
  return data ?? [];
}

async function assertExactLineage(client, evidenceRows) {
  const sourceIds = evidenceRows.map((row) => row.source_signal_id);
  const incidentIds = evidenceRows.map((row) => row.incident_id);
  const { data, error } = await client
    .from("ar_source_incident_links")
    .select("source_signal_id, incident_id")
    .in("source_signal_id", sourceIds)
    .in("incident_id", incidentIds);
  if (error) throw error;
  for (const row of evidenceRows) {
    assert.ok(
      data?.some((link) => link.source_signal_id === row.source_signal_id && link.incident_id === row.incident_id),
      "15.8U Evidence must retain exact Source→Incident lineage",
    );
  }
}

async function countTargetFeed(client, problemId) {
  const { count, error } = await client
    .from("ar_public_problem_feed")
    .select("*", { count: "exact", head: true })
    .eq("id", problemId);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const outputPath = parseOutputPath();
  const client = createServiceClient();

  const databaseBefore = await snapshotDomains(client);
  const problem = await loadTargetProblem(client);
  const evidenceRows = await loadTargetEvidence(client, problem.id);
  assert.equal(evidenceRows.length, 2, "15.8U requires the exact persisted Evidence pair");
  await assertExactLineage(client, evidenceRows);

  const incidents = await loadIncidents(client, evidenceRows.map((row) => row.incident_id));
  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]));

  const targetFeedBefore = await countTargetFeed(client, problem.id);
  assert.equal(targetFeedBefore, 0, "draft target must not be exposed in the public feed");

  const { error: publishabilityError } = await client.rpc("ar_assert_public_problem_publishable", {
    p_problem_id: problem.id,
  });
  if (publishabilityError) throw publishabilityError;

  const databaseAfter = await snapshotDomains(client);
  const targetFeedAfter = await countTargetFeed(client, problem.id);
  assert.equal(targetFeedAfter, 0, "15.8U must not create public feed exposure");

  const packet = buildPublicationCuratorPacket({
    problem,
    evidenceRows,
    incidentById,
    publishabilityGuardPassed: true,
    databaseBefore,
    databaseAfter,
  });

  await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "PUBLICATION_CURATOR_PACKET_READY",
    authority: packet.authority,
    problem_signature: packet.problem.problem_signature,
    evidence_count: packet.structural_readiness.evidence_count,
    distinct_source_count: packet.structural_readiness.distinct_source_count,
    distinct_incident_count: packet.structural_readiness.distinct_incident_count,
    publishability_guard_passed: packet.structural_readiness.publishability_guard_passed,
    publication_decision: packet.decision.publication_decision,
    publication_authorized: packet.decision.publication_authorized,
    database_mutations: 0,
    public_feed_exposure: 0,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8U] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
