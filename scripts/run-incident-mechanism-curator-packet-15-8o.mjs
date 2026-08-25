import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import {
  assertBlankCuratorDecisionTemplate,
  buildBlankCuratorDecisionTemplate,
  PHASE15_8O_PACKET_VERSION,
  PHASE15_8O_PROPOSED_COMPARISONS,
  PHASE15_8O_SOURCE_BATCH_VERSION,
  validatePhase15_8OCandidateAuthority,
} from "../lib/sources/source-incident-curator-packet.mjs";

const PHASE = "15.8O";
const EXPECTED_BATCH_ROWS = 82;
const EXPECTED_CANDIDATES = 8;
const EXPECTED_REJECTS = 66;
const EXPECTED_UNRESOLVED_REVIEWS = 8;
const ACTIONABLE_DISPOSITIONS = new Set(["strong_candidate", "curator_reread_required"]);

function parseOutputPath(argv = process.argv.slice(2)) {
  const value = argv.find((item) => item.startsWith("--output="));
  return value ? value.slice("--output=".length).trim() : "phase15-8o-curator-packet.json";
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
    incidents,
    incidentLinks,
    fullContextOutcomes,
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
    full_context_outcomes: fullContextOutcomes,
  };
}

async function loadMBOutcomes(client) {
  const { data, error } = await client
    .from("ar_source_full_context_resolution_outcomes")
    .select("source_signal_id, status, decision, reason_codes, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind")
    .eq("batch_version", PHASE15_8O_SOURCE_BATCH_VERSION)
    .order("source_signal_id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadCandidateSignals(client, ids) {
  const { data, error } = await client
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, author_handle, published_at")
    .in("id", ids)
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadExistingIncidentAuthority(client) {
  const [{ data: incidents, error: incidentError }, { data: links, error: linkError }] = await Promise.all([
    client.from("ar_source_incidents").select("id, incident_key, label").order("incident_key", { ascending: true }),
    client.from("ar_source_incident_links").select("incident_id, source_signal_id").order("incident_id", { ascending: true }),
  ]);
  if (incidentError) throw incidentError;
  if (linkError) throw linkError;
  const linksByIncident = new Map();
  for (const link of links ?? []) {
    if (!linksByIncident.has(link.incident_id)) linksByIncident.set(link.incident_id, []);
    linksByIncident.get(link.incident_id).push(link.source_signal_id);
  }
  return (incidents ?? []).map((incident) => ({
    incident_id: incident.id,
    incident_key: incident.incident_key,
    label: incident.label,
    source_signal_ids: [...(linksByIncident.get(incident.id) ?? [])].sort(),
  }));
}

async function loadExistingProblemAuthority(client) {
  const [{ data: problems, error: problemError }, { data: evidence, error: evidenceError }] = await Promise.all([
    client.from("ar_public_problems").select("id, title, summary, status").order("id", { ascending: true }),
    client.from("ar_public_problem_evidence_snapshots").select("public_problem_id, source_signal_id, incident_id").order("public_problem_id", { ascending: true }),
  ]);
  if (problemError) throw problemError;
  if (evidenceError) throw evidenceError;
  return (problems ?? []).map((problem) => {
    const rows = (evidence ?? []).filter((item) => item.public_problem_id === problem.id);
    return {
      public_problem_id: problem.id,
      title: problem.title,
      summary: problem.summary,
      status: problem.status,
      evidence_count: rows.length,
      distinct_incident_count: new Set(rows.map((item) => item.incident_id).filter(Boolean)).size,
      source_signal_ids: [...new Set(rows.map((item) => item.source_signal_id).filter(Boolean))].sort(),
      incident_ids: [...new Set(rows.map((item) => item.incident_id).filter(Boolean))].sort(),
    };
  });
}

function firstNonEmptyLine(value) {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function priorAdmissionSemantic(row) {
  return {
    problem_claim: row.problem_claim,
    experience_actor: row.experience_actor,
    friction_cause: row.friction_cause,
    friction_specificity: row.friction_specificity,
    pain_centrality: row.pain_centrality,
    content_kind: row.content_kind,
  };
}

function assertNoWriteMethods(source) {
  for (const token of [".insert(", ".upsert(", ".update(", ".delete(", ".rpc("]) {
    assert.equal(source.includes(token), false, `15.8O runner must not contain ${token}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const outcomes = await loadMBOutcomes(client);

  assert.equal(outcomes.length, EXPECTED_BATCH_ROWS, "M-B durable outcome batch size drifted");
  const candidates = outcomes.filter((row) => row.decision === "candidate");
  assert.equal(candidates.length, EXPECTED_CANDIDATES, "M-B Candidate count drifted");
  assert.equal(outcomes.filter((row) => row.decision === "reject").length, EXPECTED_REJECTS, "M-B Reject count drifted");
  assert.equal(outcomes.filter((row) => row.decision === "review").length, EXPECTED_UNRESOLVED_REVIEWS, "M-B unresolved Review count drifted");

  const planned = validatePhase15_8OCandidateAuthority(candidates);
  const blankDecisionTemplate = assertBlankCuratorDecisionTemplate(buildBlankCuratorDecisionTemplate(planned));
  const actionable = planned.filter((item) => ACTIONABLE_DISPOSITIONS.has(item.disposition));
  assert.equal(actionable.length, 5, "Phase 15.8O must expose exactly five Sources for curator reread");

  const manifest = {
    phase: PHASE,
    packet_version: PHASE15_8O_PACKET_VERSION,
    source_batch_version: PHASE15_8O_SOURCE_BATCH_VERSION,
    source_batch_rows: outcomes.length,
    candidate_count: candidates.length,
    actionable_reread_count: actionable.length,
    public_full_context_fetches_max: actionable.length,
    paid_external_model_calls: 0,
    database_writes_authorized: false,
    incident_identity_persistence_authorized: false,
    problem_signature_persistence_authorized: false,
    canonical_problem_persistence_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    console.log(JSON.stringify({ status: "ESTIMATE_ONLY", manifest }, null, 2));
    return;
  }

  const protectedBefore = await snapshotProtectedDomains(client);
  const signals = await loadCandidateSignals(client, candidates.map((row) => row.source_signal_id));
  assert.equal(signals.length, EXPECTED_CANDIDATES, "every Candidate Source must still exist");
  const sourceById = new Map(signals.map((row) => [row.id, row]));
  const priorById = new Map(candidates.map((row) => [row.source_signal_id, row]));

  const packetSources = [];
  for (const item of planned) {
    const source = sourceById.get(item.sourceSignalId);
    const prior = priorById.get(item.sourceSignalId);
    assert.ok(source, "Candidate Source lookup failed");
    assert.ok(prior, "Candidate prior outcome lookup failed");

    let fullContext = null;
    if (ACTIONABLE_DISPOSITIONS.has(item.disposition)) {
      fullContext = await fetchSourceFullContext(source);
      assert.equal(fullContext.status, "resolved", "actionable curator reread Source full context must resolve");
    }

    packetSources.push({
      source_signal_id: source.id,
      disposition: item.disposition,
      comparison_proposal_key: item.comparison_proposal_key,
      source_platform: source.source_platform,
      title: fullContext?.title ?? firstNonEmptyLine(source.raw_text),
      author_handle: source.author_handle ?? null,
      published_at: source.published_at ?? null,
      canonical_url: source.canonical_url ?? null,
      source_snippet: source.raw_text ?? null,
      prior_admission_semantic: priorAdmissionSemantic(prior),
      full_context: fullContext ? {
        status: fullContext.status,
        content_scope: fullContext.content_scope,
        content_hash: fullContext.content_hash,
        original_char_count: fullContext.original_char_count,
        truncated: Boolean(fullContext.truncated),
        content_text: fullContext.content_text,
      } : null,
    });
  }

  const [existingIncidents, existingProblems] = await Promise.all([
    loadExistingIncidentAuthority(client),
    loadExistingProblemAuthority(client),
  ]);

  const candidateIncidentLinks = existingIncidents
    .flatMap((incident) => incident.source_signal_ids.map((sourceSignalId) => ({ incident_id: incident.incident_id, source_signal_id: sourceSignalId })))
    .filter((link) => candidateRowsHas(candidates, link.source_signal_id));
  assert.equal(candidateIncidentLinks.length, 0, "new M-B Candidate cohort must remain unassigned to Incident authority in 15.8O");

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.8O must remain database read-only");

  const artifact = {
    version: PHASE15_8O_PACKET_VERSION,
    authority: "curator_decision_packet_not_a_decision",
    manifest,
    proposed_comparisons: PHASE15_8O_PROPOSED_COMPARISONS,
    sources: packetSources,
    existing_authority: {
      incidents: existingIncidents,
      public_problems: existingProblems,
      candidate_incident_links: candidateIncidentLinks,
    },
    curator_decision_template: blankDecisionTemplate,
    database_posture: {
      protected_before: protectedBefore,
      protected_after: protectedAfter,
      unchanged: true,
      write_statements: 0,
    },
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "CURATOR_PACKET_COMPLETE",
    manifest,
    source_disposition_counts: Object.fromEntries(
      [...new Set(planned.map((item) => item.disposition))]
        .sort()
        .map((disposition) => [disposition, planned.filter((item) => item.disposition === disposition).length]),
    ),
    actionable_full_context_resolved: packetSources.filter((item) => item.full_context?.status === "resolved").length,
    existing_incidents: existingIncidents.length,
    existing_public_problems: existingProblems.length,
    candidate_incident_links: candidateIncidentLinks.length,
    curator_decisions_completed: 0,
    database_writes: 0,
    protected_domains_unchanged: true,
    output_path: outputPath,
  }, null, 2));
}

function candidateRowsHas(candidates, sourceSignalId) {
  return candidates.some((row) => row.source_signal_id === sourceSignalId);
}

main().catch((error) => {
  console.error(`[15.8O] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
