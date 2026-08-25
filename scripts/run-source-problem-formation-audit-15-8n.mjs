import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  getSourceProblemFormationProviderConfig,
  resolveSourceProblemFormationAudit,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
} from "../lib/sources/source-problem-formation-observer.mjs";

const PHASE = "15.8N";
const SOURCE_BATCH_VERSION = "phase15.8m-b-remainder-v0.1";
const AUDIT_VERSION = "phase15.8n-formation-audit-v0.1";
const EXPECTED_BATCH_ROWS = 82;
const EXPECTED_CANDIDATES = 8;
const EXPECTED_REJECTS = 66;
const EXPECTED_UNRESOLVED_REVIEWS = 8;
const EXPECTED_CANDIDATE_FINGERPRINT = "aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020";
const LOOKUP_CHUNK_SIZE = 100;

function fingerprint(values) {
  return createHash("sha256").update([...values].map(String).sort().join("\n")).digest("hex");
}

function parseOutputPath(argv = process.argv.slice(2)) {
  const argument = argv.find((value) => value.startsWith("--output="));
  return argument ? argument.slice("--output=".length).trim() : "phase15-8n-formation-audit.json";
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
    full_context_outcomes: fullContextOutcomes,
  };
}

async function loadMBOutcomes(client) {
  const { data, error } = await client
    .from("ar_source_full_context_resolution_outcomes")
    .select("source_signal_id, status, decision, reason_codes, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind")
    .eq("batch_version", SOURCE_BATCH_VERSION)
    .order("source_signal_id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadSignals(client, sourceIds) {
  const rows = [];
  for (let index = 0; index < sourceIds.length; index += LOOKUP_CHUNK_SIZE) {
    const ids = sourceIds.slice(index, index + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, canonical_url, raw_text, published_at")
      .in("id", ids);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function distribution(rows, key) {
  const result = {};
  for (const row of rows) {
    const value = String(row?.[key] ?? "unknown");
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function reasonDistribution(rows) {
  const result = {};
  for (const row of rows) {
    for (const code of row?.reason_codes ?? []) result[code] = (result[code] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function firstNonEmptyLine(value) {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function buildAuditItem({ source, prior, result }) {
  const semantic = result.semantic ?? null;
  const context = result.full_context ?? null;
  return {
    source_signal_id: source.id,
    source_platform: source.source_platform,
    title: context?.title ?? firstNonEmptyLine(source.raw_text),
    published_at: source.published_at ?? null,
    formation_state: result.formation_state,
    resolved: result.resolved,
    reason_codes: [...(result.reason_codes ?? [])],
    prior_admission_semantic: {
      problem_claim: prior.problem_claim,
      experience_actor: prior.experience_actor,
      friction_cause: prior.friction_cause,
      friction_specificity: prior.friction_specificity,
      pain_centrality: prior.pain_centrality,
      content_kind: prior.content_kind,
    },
    formation_semantic: semantic ? {
      problem_claim: semantic.problem_claim,
      experience_actor: semantic.experience_actor,
      friction_specificity: semantic.friction_specificity,
      pain_centrality: semantic.pain_centrality,
      content_kind: semantic.content_kind,
      source_origin: semantic.source_origin,
      friction_responsibility: semantic.friction_responsibility,
      evidence_quote: semantic.evidence_quote,
    } : null,
    non_authoritative_proposals: semantic ? {
      problem_mechanism: semantic.problem_mechanism_proposal,
      incident_summary: semantic.incident_summary_proposal,
    } : null,
    context: {
      status: context?.status ?? "unavailable",
      content_scope: context?.content_scope ?? null,
      content_hash: context?.content_hash ?? null,
      original_char_count: context?.original_char_count ?? null,
      truncated: Boolean(context?.truncated),
    },
    recovery: {
      attempted: Boolean(result.recovery?.attempted),
      recovered: Boolean(result.recovery?.recovered),
      attempt_count: Number(result.recovery?.attempt_count ?? 0),
      trigger_reason_code: result.recovery?.trigger_reason_code ?? null,
    },
  };
}

function assertArtifactPrivacy(item) {
  const serialized = JSON.stringify(item);
  for (const forbiddenKey of ["content_text", "canonical_url", "fetched_url", "author_handle", "provider_request_id"]) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false, `audit artifact must not contain ${forbiddenKey}`);
  }
}

function summarizeAudit(items, priorCandidates) {
  const stateCounts = distribution(items, "formation_state");
  const resolved = items.filter((item) => item.resolved).length;
  const priorContentKindById = new Map(priorCandidates.map((row) => [row.source_signal_id, row.content_kind]));
  const semanticContentKinds = items.map((item) => ({ content_kind: item.formation_semantic?.content_kind ?? "unknown" }));
  const origins = items.map((item) => ({ source_origin: item.formation_semantic?.source_origin ?? "unknown" }));
  const responsibilities = items.map((item) => ({ friction_responsibility: item.formation_semantic?.friction_responsibility ?? "unknown" }));
  const contentKindDrift = items.filter((item) => {
    const formationKind = item.formation_semantic?.content_kind ?? null;
    return formationKind != null && formationKind !== priorContentKindById.get(item.source_signal_id);
  }).length;
  return {
    total: items.length,
    eligible: stateCounts.eligible ?? 0,
    provenance_review: stateCounts.provenance_review ?? 0,
    review: stateCounts.review ?? 0,
    reject: stateCounts.reject ?? 0,
    resolved,
    unresolved: items.length - resolved,
    reason_codes: reasonDistribution(items),
    formation_content_kind: distribution(semanticContentKinds, "content_kind"),
    source_origin: distribution(origins, "source_origin"),
    friction_responsibility: distribution(responsibilities, "friction_responsibility"),
    content_kind_disagreement_with_m_b: contentKindDrift,
    provider_recovery_attempted: items.filter((item) => item.recovery.attempted).length,
    provider_recovery_recovered: items.filter((item) => item.recovery.recovered).length,
  };
}

async function main() {
  const live = process.argv.includes("--live");
  const outputPath = parseOutputPath();
  const client = createServiceClient();
  const outcomes = await loadMBOutcomes(client);

  assert.equal(outcomes.length, EXPECTED_BATCH_ROWS, "M-B durable outcome batch size drifted");
  const candidates = outcomes.filter((row) => row.decision === "candidate");
  const rejects = outcomes.filter((row) => row.decision === "reject");
  const unresolvedReviews = outcomes.filter((row) => row.decision === "review");
  assert.equal(candidates.length, EXPECTED_CANDIDATES, "M-B Candidate cohort size drifted");
  assert.equal(rejects.length, EXPECTED_REJECTS, "M-B Reject cohort size drifted");
  assert.equal(unresolvedReviews.length, EXPECTED_UNRESOLVED_REVIEWS, "M-B unresolved Review cohort size drifted");
  assert.equal(
    fingerprint(candidates.map((row) => row.source_signal_id)),
    EXPECTED_CANDIDATE_FINGERPRINT,
    "M-B Candidate fingerprint drifted",
  );

  const unresolvedReasonCounts = reasonDistribution(unresolvedReviews);
  const manifest = {
    phase: PHASE,
    audit_version: AUDIT_VERSION,
    observer_version: SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
    source_batch_version: SOURCE_BATCH_VERSION,
    source_batch_rows: outcomes.length,
    candidate_count: candidates.length,
    candidate_fingerprint: EXPECTED_CANDIDATE_FINGERPRINT,
    blocked_unresolved_review_count: unresolvedReviews.length,
    blocked_unresolved_reason_counts: unresolvedReasonCounts,
    database_writes_authorized: false,
    incident_identity_authorized: false,
    problem_signature_authorized: false,
    canonical_problem_authorized: false,
    publication_authorized: false,
  };

  if (!live) {
    console.log(JSON.stringify({
      status: "ESTIMATE_ONLY",
      manifest,
      public_full_context_fetches_max: EXPECTED_CANDIDATES,
      paid_external_model_calls_max: EXPECTED_CANDIDATES * 2,
      database_write_statements: 0,
      audit_artifact_contains_full_body: false,
    }, null, 2));
    return;
  }

  assert.equal(process.env.ALLOW_PAID_SOURCE_FORMATION, "true", "Live 15.8N requires explicit paid Formation opt-in");
  const provider = getSourceProblemFormationProviderConfig(process.env);
  const protectedBefore = await snapshotProtectedDomains(client);

  const signals = await loadSignals(client, candidates.map((row) => row.source_signal_id));
  assert.equal(signals.length, EXPECTED_CANDIDATES, "every Candidate Source must still exist");
  const sourceById = new Map(signals.map((source) => [source.id, source]));
  const auditItems = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const prior = candidates[index];
    const source = sourceById.get(prior.source_signal_id);
    assert.ok(source, "Candidate Source lookup failed");
    const result = await resolveSourceProblemFormationAudit(source, {
      env: {
        ...process.env,
        OPENAI_SOURCE_FORMATION_MODEL: provider.model,
      },
      maxSemanticAttempts: 2,
    });
    const item = buildAuditItem({ source, prior, result });
    assertArtifactPrivacy(item);
    auditItems.push(item);
    console.log(`[formation-audit] ${index + 1}/${EXPECTED_CANDIDATES} state=${item.formation_state} resolved=${item.resolved} retry_attempted=${item.recovery.attempted}`);
  }

  assert.equal(auditItems.length, EXPECTED_CANDIDATES, "Formation audit must cover all 8 durable Candidates");
  assert.equal(new Set(auditItems.map((item) => item.source_signal_id)).size, EXPECTED_CANDIDATES, "Formation audit Sources must be unique");
  assert.equal(fingerprint(auditItems.map((item) => item.source_signal_id)), EXPECTED_CANDIDATE_FINGERPRINT, "Formation artifact cohort drifted");

  const protectedAfter = await snapshotProtectedDomains(client);
  assert.deepEqual(protectedAfter, protectedBefore, "Phase 15.8N must remain database read-only");

  const summary = summarizeAudit(auditItems, candidates);
  const artifact = {
    version: AUDIT_VERSION,
    authority: "empirical_formation_audit_not_runtime_truth",
    source_authority: manifest,
    provider: {
      name: "openai",
      model: provider.model,
    },
    summary,
    items: auditItems,
    downstream_authority: {
      incident_identity_assigned: false,
      problem_signature_assigned: false,
      repeated_problem_clusters_asserted: false,
      canonical_problem_drafts_created: 0,
      database_rows_written: 0,
      publication_mutations: 0,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "LIVE_AUDIT_COMPLETE",
    manifest,
    summary,
    output_path: outputPath,
    database_write_statements: 0,
    protected_domains_unchanged: true,
    individual_source_identities_emitted_to_log: false,
    audit_artifact_contains_full_body: false,
    formation_authority_granted: false,
    incident_authority_granted: false,
    canonical_problem_authority_granted: false,
    publication_authority_granted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[formation-audit] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
