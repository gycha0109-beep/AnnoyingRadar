import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  PHASE15_8V_APPROVAL,
  PHASE15_8V_PROBLEM_SIGNATURE,
  PHASE15_8V_VERSION,
  assertApprovedPublicationPreconditions,
  assertPublishedReadback,
} from "../lib/sources/approved-publication-execution.mjs";
import { PHASE15_8T_EVIDENCE_AUTHORITIES } from "../lib/sources/public-evidence-persistence-pair.mjs";

const PHASE = "15.8V";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8v-publication-execution.json";
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

async function countProblemStatus(client, status) {
  const { count, error } = await client
    .from("ar_public_problems")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

async function loadTargetProblem(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("id, problem_signature, title, summary, target_user, situation, category, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_8V_PROBLEM_SIGNATURE);
  if (error) throw error;
  assert.equal(data?.length, 1, "15.8V requires exactly one approved Canonical Problem identity");
  return data[0];
}

async function loadTargetEvidence(client, problemId) {
  const { data, error } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("excerpt, publication_basis, source_type, source_label, source_url, source_key, source_signal_id, incident_id, order_index")
    .eq("public_problem_id", problemId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 2, "15.8V requires the exact persisted two-Evidence authority");
  return data;
}

async function loadIncidents(client, evidenceRows) {
  const incidentIds = evidenceRows.map((row) => row.incident_id);
  const { data, error } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("id", incidentIds);
  if (error) throw error;
  assert.equal(data?.length, 2, "15.8V requires exactly two approved Incidents");
  return new Map(data.map((incident) => [incident.id, incident]));
}

async function assertExactLineage(client, evidenceRows) {
  const { data, error } = await client
    .from("ar_source_incident_links")
    .select("source_signal_id, incident_id")
    .in("source_signal_id", evidenceRows.map((row) => row.source_signal_id))
    .in("incident_id", evidenceRows.map((row) => row.incident_id));
  if (error) throw error;
  for (const row of evidenceRows) {
    assert.ok(
      data?.some((link) => link.source_signal_id === row.source_signal_id && link.incident_id === row.incident_id),
      "15.8V Evidence must retain exact Source→Incident lineage",
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

async function loadOwnerCurator(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .eq("role", "owner")
    .order("user_id", { ascending: true });
  if (error) throw error;
  assert.equal(data?.length, 1, "15.8V requires exactly one Radar owner curator");
  return data[0].user_id;
}

function assertOnlyPublicationProjectionChanged(before, after) {
  for (const key of [
    "source_signals",
    "source_observations",
    "source_ingestion_runs",
    "raw_inputs",
    "pain_evidences",
    "public_problems",
    "public_evidence",
    "source_incidents",
    "source_incident_links",
    "full_context_outcomes",
  ]) {
    assert.equal(after[key], before[key], `15.8V must not change ${key} row count`);
  }
  assert.equal(after.public_feed, before.public_feed + 1,
    "15.8V must expose exactly one newly published Problem in public feed");
}

function safeEvidenceAuthority() {
  return PHASE15_8T_EVIDENCE_AUTHORITIES.map((item) => ({
    order_index: item.order_index,
    incident_key: item.incident_key,
    source_key_sha256: item.source_key_sha256,
    excerpt_length: item.excerpt_length,
    excerpt_sha256: item.excerpt_sha256,
    readiness_authority: item.readiness_authority,
  }));
}

function assertSafeArtifact(artifact) {
  const serialized = JSON.stringify(artifact);
  for (const forbidden of [
    "source_signal_id", "incident_id", "public_problem_id", "source_url", "source_key",
    "excerpt", "canonical_url", "content_text", "raw_text",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false,
      `15.8V artifact must not contain ${forbidden}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();

  const before = await snapshotDomains(client);
  const problemBefore = await loadTargetProblem(client);
  const evidenceBefore = await loadTargetEvidence(client, problemBefore.id);
  const incidentByIdBefore = await loadIncidents(client, evidenceBefore);
  await assertExactLineage(client, evidenceBefore);
  const targetFeedBefore = await countTargetFeed(client, problemBefore.id);
  assertApprovedPublicationPreconditions({
    problem: problemBefore,
    evidenceRows: evidenceBefore,
    incidentById: incidentByIdBefore,
    targetFeedRows: targetFeedBefore,
  });

  const [publishedBefore, draftBefore] = await Promise.all([
    countProblemStatus(client, "published"),
    countProblemStatus(client, "draft"),
  ]);

  const manifest = {
    phase: PHASE,
    version: PHASE15_8V_VERSION,
    problem_signature: PHASE15_8V_PROBLEM_SIGNATURE,
    curator_decision: PHASE15_8V_APPROVAL,
    expected_status_transition: "draft->published",
    status_rpc_calls: 1,
    external_model_calls: 0,
    metadata_edits: 0,
    evidence_edits: 0,
  };

  if (!live) {
    console.log(JSON.stringify({ status: "ESTIMATE_ONLY", manifest, database_before: before }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PUBLIC_PROBLEM_PUBLICATION, "true",
    "live 15.8V requires ALLOW_PUBLIC_PROBLEM_PUBLICATION=true");
  const curatorUserId = await loadOwnerCurator(client);

  const { error: publicationError } = await client.rpc("ar_set_public_problem_status", {
    p_problem_id: problemBefore.id,
    p_curator_user_id: curatorUserId,
    p_status: "published",
  });
  if (publicationError) throw publicationError;

  const problemAfter = await loadTargetProblem(client);
  assert.equal(problemAfter.id, problemBefore.id, "15.8V must retain Canonical Problem identity");
  const evidenceAfter = await loadTargetEvidence(client, problemAfter.id);
  const incidentByIdAfter = await loadIncidents(client, evidenceAfter);
  await assertExactLineage(client, evidenceAfter);
  const targetFeedAfter = await countTargetFeed(client, problemAfter.id);
  assertPublishedReadback({
    problem: problemAfter,
    evidenceRows: evidenceAfter,
    incidentById: incidentByIdAfter,
    targetFeedRows: targetFeedAfter,
  });

  const after = await snapshotDomains(client);
  assertOnlyPublicationProjectionChanged(before, after);
  const [publishedAfter, draftAfter] = await Promise.all([
    countProblemStatus(client, "published"),
    countProblemStatus(client, "draft"),
  ]);
  assert.equal(publishedAfter, publishedBefore + 1, "15.8V must add exactly one published Problem");
  assert.equal(draftAfter, draftBefore - 1, "15.8V must consume exactly one draft Problem");

  const artifact = {
    authority: "explicit_curator_approved_publication_execution",
    manifest,
    problem: {
      problem_signature: problemAfter.problem_signature,
      title: problemAfter.title,
      summary: problemAfter.summary,
      target_user: problemAfter.target_user,
      situation: problemAfter.situation,
      category: problemAfter.category,
      status_before: problemBefore.status,
      status_after: problemAfter.status,
      published_at: problemAfter.published_at,
    },
    evidence_authority: safeEvidenceAuthority(),
    database_before: before,
    database_after: after,
    published_count_before: publishedBefore,
    published_count_after: publishedAfter,
    draft_count_before: draftBefore,
    draft_count_after: draftAfter,
    target_public_feed_before: targetFeedBefore,
    target_public_feed_after: targetFeedAfter,
    status_rpc_calls: 1,
    publication_performed: true,
    metadata_edits_performed: false,
    evidence_edits_performed: false,
    raw_internal_ids_emitted: false,
  };
  assertSafeArtifact(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "PUBLICATION_COMPLETE",
    problem_signature: PHASE15_8V_PROBLEM_SIGNATURE,
    status_before: "draft",
    status_after: "published",
    target_public_feed_rows: 1,
    status_rpc_calls: 1,
    metadata_edits_performed: false,
    evidence_edits_performed: false,
    publication_performed: true,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8V] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
