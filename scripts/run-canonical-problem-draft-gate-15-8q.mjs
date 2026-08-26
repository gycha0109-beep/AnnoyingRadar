import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  buildPhase15_8QCanonicalDraft,
  PHASE15_8Q_INCIDENT_KEYS,
  PHASE15_8Q_VERSION,
} from "../lib/sources/approved-canonical-problem-draft.mjs";
import { fingerprintSourceSignalIds } from "../lib/sources/source-incident-curator-packet.mjs";

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8q-canonical-problem-draft-gate.json";
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
    ["source_incidents", "ar_source_incidents"],
    ["source_incident_links", "ar_source_incident_links"],
    ["full_context_outcomes", "ar_source_full_context_resolution_outcomes"],
  ];
  const counts = await Promise.all(tables.map(([, table]) => countRows(client, table)));
  return Object.fromEntries(tables.map(([key], index) => [key, counts[index]]));
}

async function loadApprovedIncidentLinks(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id, incident_key")
    .in("incident_key", PHASE15_8Q_INCIDENT_KEYS)
    .order("incident_key", { ascending: true });
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 2, "Phase 15.8Q requires both approved persisted Incidents");

  const incidentIds = incidents.map((item) => item.id);
  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("incident_id, source_signal_id")
    .in("incident_id", incidentIds)
    .order("incident_id", { ascending: true });
  if (linkError) throw linkError;
  assert.equal(links?.length, 2, "approved persisted Incidents must each have exactly one Source link");

  const incidentKeyById = new Map(incidents.map((item) => [item.id, item.incident_key]));
  const normalized = links.map((link) => ({
    incident_key: incidentKeyById.get(link.incident_id),
    source_signal_id: link.source_signal_id,
  }));
  assert.ok(normalized.every((item) => item.incident_key), "Incident→Source readback contained an unknown Incident");
  return normalized;
}

async function loadPublicProblems(client) {
  const { data, error } = await client
    .from("ar_public_problems")
    .select("title, summary, target_user, situation, category, status, published_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function assertZeroMutation(before, after) {
  assert.deepEqual(after, before, "Phase 15.8Q is read-only and must not mutate protected database domains");
}

async function main() {
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const before = await snapshotDomains(client);
  const [incidentLinks, publicProblems] = await Promise.all([
    loadApprovedIncidentLinks(client),
    loadPublicProblems(client),
  ]);

  const authority = buildPhase15_8QCanonicalDraft({ incidentLinks, publicProblems });
  const draft = authority.draft_result.draft;
  const sourceFingerprint = fingerprintSourceSignalIds(
    incidentLinks.map((item) => item.source_signal_id),
  );

  const after = await snapshotDomains(client);
  assertZeroMutation(before, after);

  const artifact = {
    authority: authority.authority,
    version: PHASE15_8Q_VERSION,
    problem_signature: draft.problem_signature,
    draft_state: authority.draft_result.draft_state,
    reason_codes: authority.draft_result.reason_codes,
    draft: {
      title: draft.title,
      summary: draft.summary,
      target_user: draft.target_user,
      situation: draft.situation,
      category: draft.category,
      source_count: draft.source_count,
      incident_count: draft.incident_count,
      persistence_state: draft.persistence_state,
      publication_state: draft.publication_state,
    },
    incident_keys: [...PHASE15_8Q_INCIDENT_KEYS],
    source_identity_fingerprint: sourceFingerprint,
    source_signal_ids_emitted: false,
    relationship_to_existing_lodging_problem: authority.relationship_to_existing_lodging_problem,
    database_before: before,
    database_after: after,
    database_mutations: 0,
    canonical_problem_created: false,
    public_evidence_created: false,
    existing_problem_mutated: false,
    publication_performed: false,
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "CANONICAL_DRAFT_GATE_READY",
    problem_signature: draft.problem_signature,
    draft_state: authority.draft_result.draft_state,
    source_count: draft.source_count,
    incident_count: draft.incident_count,
    relationship: authority.relationship_to_existing_lodging_problem.relation,
    persistence_state: draft.persistence_state,
    public_evidence_created: false,
    publication_performed: false,
    database_mutations: 0,
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8Q] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
