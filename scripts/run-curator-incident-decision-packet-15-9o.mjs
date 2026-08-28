import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  buildCuratorIncidentDecisionPacket,
  SOURCE_INCIDENT_DECISION_PACKET_VERSION,
} from "../lib/sources/source-incident-decision-packet-service.mjs";
import { SOURCE_FORMATION_ASSESSMENT_TABLE } from "../lib/sources/source-formation-assessment-persistence.mjs";

const PHASE = "15.9O";
const TARGET_ASSESSMENT_BATCH = "phase15.9n-ordinal9-persistence-v0.1";
const MAX_SOURCE_NETWORK_REQUESTS = 8;

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-9o-curator-incident-decision-packet.json";
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotProtectedDomains(client) {
  const [
    signals,
    observations,
    ingestionRuns,
    rawInputs,
    painEvidence,
    publicProblems,
    publicEvidence,
    publicFeed,
    incidents,
    incidentLinks,
    fullContextOutcomes,
    formationAssessments,
  ] = await Promise.all([
    countRows(client, "ar_source_signals"),
    countRows(client, "ar_source_signal_observations"),
    countRows(client, "ar_source_ingestion_runs"),
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
    countRows(client, "ar_public_problem_evidence_snapshots"),
    countRows(client, "ar_public_problem_feed"),
    countRows(client, "ar_source_incidents"),
    countRows(client, "ar_source_incident_links"),
    countRows(client, "ar_source_full_context_resolution_outcomes"),
    countRows(client, SOURCE_FORMATION_ASSESSMENT_TABLE),
  ]);
  return {
    source_signals: signals,
    source_observations: observations,
    source_ingestion_runs: ingestionRuns,
    raw_inputs: rawInputs,
    pain_evidences: painEvidence,
    public_problems: publicProblems,
    public_evidence: publicEvidence,
    public_feed: publicFeed,
    source_incidents: incidents,
    source_incident_links: incidentLinks,
    full_context_outcomes: fullContextOutcomes,
    formation_assessments: formationAssessments,
  };
}

async function loadExactTargetAssessment(client) {
  const { data, error } = await client
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id, source_signal_id, assessment_batch_version, status, formation_state, context_content_sha256, context_char_count")
    .eq("assessment_batch_version", TARGET_ASSESSMENT_BATCH);
  if (error) throw error;
  const rows = data ?? [];
  assert.equal(rows.length, 1, "Phase 15.9O requires exactly one durable 15.9N target assessment");
  assert.equal(rows[0].status, "resolved");
  assert.equal(rows[0].formation_state, "eligible");
  return rows[0];
}

function assertBlankDecisionTemplate(template) {
  assert.equal(template?.authority, "blank_curator_incident_decision_template_not_a_decision");
  for (const key of [
    "evidence_decision",
    "incident_action",
    "existing_incident_id",
    "new_incident_key",
    "new_incident_label",
    "notes",
  ]) {
    assert.equal(template?.[key], null, `curator decision field ${key} must remain blank`);
  }
  assert.equal(template?.persistence_authorized, false);
}

function buildSanitizedArtifact({ target, packet, sourceNetworkRequests, protectedBefore, protectedAfter }) {
  return {
    phase: PHASE,
    version: SOURCE_INCIDENT_DECISION_PACKET_VERSION,
    authority: "curator_incident_decision_packet_not_a_decision",
    target: {
      assessment_batch_version: TARGET_ASSESSMENT_BATCH,
      status: target.status,
      formation_state: target.formation_state,
      context_content_sha256: target.context_content_sha256,
      context_char_count: target.context_char_count,
    },
    packet: {
      formation_state: packet.formation_assessment_authority.formation_state,
      reason_codes: packet.formation_assessment_authority.reason_codes,
      semantic: packet.formation_assessment_authority.semantic,
      problem_mechanism_proposal_present: Boolean(packet.formation_assessment_authority.problem_mechanism_proposal),
      incident_summary_proposal_present: Boolean(packet.formation_assessment_authority.incident_summary_proposal),
      context_content_sha256: packet.formation_assessment_authority.context.content_sha256,
      context_char_count: packet.formation_assessment_authority.context.char_count,
      evidence_quote_sha256: packet.formation_assessment_authority.evidence.quote_sha256,
      evidence_quote_char_count: packet.formation_assessment_authority.evidence.quote_char_count,
      evidence_quote_grounding_reconstructed: Boolean(packet.formation_assessment_authority.evidence.quote),
      existing_incident_count: packet.existing_authority.incidents.length,
      existing_public_problem_count: packet.existing_authority.public_problems.length,
      curator_decision_fields_completed: 0,
      persistence_authorized: packet.curator_decision_template.persistence_authorized,
    },
    execution: {
      source_network_requests: sourceNetworkRequests,
      source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
      model_calls: 0,
      database_write_statements: 0,
    },
    database_posture: {
      protected_before: protectedBefore,
      protected_after: protectedAfter,
      unchanged: true,
    },
    privacy: {
      source_signal_id_emitted: false,
      formation_assessment_id_emitted: false,
      canonical_url_emitted: false,
      author_handle_emitted: false,
      full_source_body_emitted: false,
      raw_evidence_quote_emitted: false,
      provider_request_id_emitted: false,
    },
    downstream_authority: {
      incident_persistence_authorized: false,
      problem_signature_persistence_authorized: false,
      public_evidence_persistence_authorized: false,
      canonical_problem_persistence_authorized: false,
      publication_authorized: false,
    },
  };
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const target = await loadExactTargetAssessment(client);
  const protectedBefore = await snapshotProtectedDomains(client);

  const manifest = {
    phase: PHASE,
    version: SOURCE_INCIDENT_DECISION_PACKET_VERSION,
    target_assessment_batch: TARGET_ASSESSMENT_BATCH,
    target_count: 1,
    source_network_requests_max: MAX_SOURCE_NETWORK_REQUESTS,
    model_calls: 0,
    database_writes: 0,
    incident_persistence_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    console.log(JSON.stringify({ status: "ESTIMATE_ONLY", manifest, database_before: protectedBefore }, null, 2));
    return;
  }

  assert.equal(
    process.env.ALLOW_PHASE15_9O_CURATOR_INCIDENT_DECISION_PACKET,
    "true",
    "live Phase 15.9O requires ALLOW_PHASE15_9O_CURATOR_INCIDENT_DECISION_PACKET=true",
  );

  let sourceNetworkRequests = 0;
  const countedFetch = async (...args) => {
    sourceNetworkRequests += 1;
    assert.ok(sourceNetworkRequests <= MAX_SOURCE_NETWORK_REQUESTS, "Phase 15.9O source network request budget exceeded");
    return globalThis.fetch(...args);
  };

  const packet = await buildCuratorIncidentDecisionPacket(client, {
    signalId: target.source_signal_id,
    formationAssessmentId: target.id,
    fetchImpl: countedFetch,
  });

  assert.equal(packet.authority, "curator_incident_decision_packet_not_a_decision");
  assert.equal(packet.formation_assessment_authority.formation_state, "eligible");
  assert.equal(packet.formation_assessment_authority.context.content_sha256, target.context_content_sha256);
  assert.equal(packet.formation_assessment_authority.context.char_count, target.context_char_count);
  assert.ok(packet.formation_assessment_authority.evidence.quote.length > 0, "exact grounded evidence quote must reconstruct");
  assertBlankDecisionTemplate(packet.curator_decision_template);
  assert.equal(packet.runtime_posture.model_calls, 0);
  assert.equal(packet.runtime_posture.database_writes, 0);
  assert.ok(sourceNetworkRequests >= 1, "Phase 15.9O must re-fetch current public context");

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.9O must not mutate protected database domains");

  const artifact = buildSanitizedArtifact({
    target,
    packet,
    sourceNetworkRequests,
    protectedBefore,
    protectedAfter,
  });
  const serialized = JSON.stringify(artifact, null, 2);
  for (const sensitive of [
    target.source_signal_id,
    target.id,
    packet.source.canonical_url,
    packet.source.author_handle,
    packet.source.full_context.content_text,
    packet.formation_assessment_authority.evidence.quote,
  ].filter(Boolean)) {
    assert.equal(serialized.includes(String(sensitive)), false, "sanitized Phase 15.9O artifact leaked runtime source identity/content");
  }

  await writeFile(outputPath, `${serialized}\n`, "utf8");
  console.log(JSON.stringify({
    status: "CURATOR_INCIDENT_DECISION_PACKET_COMPLETE",
    formation_state: packet.formation_assessment_authority.formation_state,
    evidence_grounding_reconstructed: true,
    existing_incident_count: packet.existing_authority.incidents.length,
    existing_public_problem_count: packet.existing_authority.public_problems.length,
    curator_decisions_completed: 0,
    source_network_requests: sourceNetworkRequests,
    model_calls: 0,
    database_writes: 0,
    protected_domains_unchanged: true,
    persistence_authorized: false,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9O] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
