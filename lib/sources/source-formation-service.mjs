import { getEvaluationSampleIds } from "./blind-evaluation.mjs";
import { classifySourceOrigin } from "./source-origin.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "./source-full-context-outcome-persistence.mjs";
import { resolveSourceProblemFormationAudit } from "./source-problem-formation-observer.mjs";

export const SOURCE_FORMATION_ASSESSMENT_VERSION = "source-formation-assessment-v0.1";

export class SourceFormationAssessmentError extends Error {
  constructor(code, message, { status = 409 } = {}) {
    super(message);
    this.name = "SourceFormationAssessmentError";
    this.code = code;
    this.status = status;
  }
}

async function requireSourceIdentity(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id")
    .eq("id", signalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new SourceFormationAssessmentError("source_signal_not_found", "Source Signal not found", { status: 404 });
  }
  return data.id;
}

async function requireNonBlindSource(serviceClient, signalId) {
  const blindIds = await getEvaluationSampleIds(serviceClient);
  if (blindIds.has(signalId)) {
    throw new SourceFormationAssessmentError(
      "source_formation_blind_member_blocked",
      "Blind evaluation Sources cannot be opened by Formation assessment",
      { status: 409 },
    );
  }
}

async function requireSingleDurableCandidateOutcome(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("id, outcome_schema_version, batch_version, status, decision, reason_codes, evaluated_at, created_at")
    .eq("source_signal_id", signalId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) {
    throw new SourceFormationAssessmentError(
      "source_formation_durable_outcome_required",
      "Formation assessment requires a durable full-context Source Admission outcome",
      { status: 409 },
    );
  }
  if (rows.length !== 1) {
    throw new SourceFormationAssessmentError(
      "source_formation_durable_outcome_ambiguous",
      "Formation assessment fails closed when multiple durable outcomes exist for one Source",
      { status: 409 },
    );
  }
  const outcome = rows[0];
  if (outcome.status !== "resolved" || outcome.decision !== "candidate") {
    throw new SourceFormationAssessmentError(
      "source_formation_candidate_required",
      "Only a resolved durable Source Admission Candidate may enter Formation assessment",
      { status: 409 },
    );
  }
  return outcome;
}

async function requireNoDownstreamAssignment(serviceClient, signalId) {
  const [{ data: links, error: linkError }, { data: publicEvidence, error: evidenceError }] = await Promise.all([
    serviceClient
      .from("ar_source_incident_links")
      .select("source_signal_id")
      .eq("source_signal_id", signalId)
      .limit(1),
    serviceClient
      .from("ar_public_problem_evidence_snapshots")
      .select("source_signal_id")
      .eq("source_signal_id", signalId)
      .limit(1),
  ]);
  if (linkError) throw linkError;
  if (evidenceError) throw evidenceError;
  if ((links ?? []).length > 0 || (publicEvidence ?? []).length > 0) {
    throw new SourceFormationAssessmentError(
      "source_formation_downstream_assignment_exists",
      "Source already has downstream Incident or Public Evidence authority and cannot be re-assessed here",
      { status: 409 },
    );
  }
}

async function loadFormationSource(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, published_at, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .eq("id", signalId)
    .single();
  if (error) throw error;
  return data;
}

function safeSemantic(semantic) {
  if (!semantic) return null;
  return {
    problem_claim: semantic.problem_claim,
    experience_actor: semantic.experience_actor,
    friction_specificity: semantic.friction_specificity,
    pain_centrality: semantic.pain_centrality,
    content_kind: semantic.content_kind,
    source_origin: semantic.source_origin,
    friction_responsibility: semantic.friction_responsibility,
    evidence_quote: semantic.evidence_quote,
    problem_mechanism_proposal: semantic.problem_mechanism_proposal,
    incident_summary_proposal: semantic.incident_summary_proposal,
    prompt_version: semantic.prompt_version,
    provider: semantic.provider,
    model: semantic.model,
  };
}

function safeFullContext(fullContext) {
  if (!fullContext) return null;
  return {
    status: fullContext.status,
    content_scope: fullContext.content_scope ?? null,
    content_hash: fullContext.content_hash ?? null,
    original_char_count: fullContext.original_char_count ?? null,
    truncated: Boolean(fullContext.truncated),
    extraction_scope: fullContext.extraction_scope ?? null,
    error_code: fullContext.error_code ?? null,
  };
}

export function buildCuratorFormationAssessment({ signalId, outcome, result }) {
  return {
    version: SOURCE_FORMATION_ASSESSMENT_VERSION,
    authority: "curator_read_only_formation_assessment_not_persistence",
    source_signal_id: signalId,
    source_admission_authority: {
      outcome_schema_version: outcome.outcome_schema_version,
      batch_version: outcome.batch_version,
      status: outcome.status,
      decision: outcome.decision,
      reason_codes: [...(outcome.reason_codes ?? [])],
      evaluated_at: outcome.evaluated_at ?? null,
      created_at: outcome.created_at ?? null,
    },
    formation: {
      observer_version: result.version,
      status: result.status,
      formation_state: result.formation_state,
      resolved: result.resolved,
      reason_codes: [...(result.reason_codes ?? [])],
      semantic: safeSemantic(result.semantic),
      full_context: safeFullContext(result.full_context),
      recovery: result.recovery ? { ...result.recovery } : null,
    },
    downstream_authority: {
      incident_identity_assigned: false,
      source_incident_link_created: false,
      problem_signature_assigned: false,
      public_evidence_created: false,
      publication_mutated: false,
    },
  };
}

export async function assessSourceFormationForCurator(serviceClient, {
  signalId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  fetchContext,
  judgeContext,
} = {}) {
  const normalizedSignalId = String(signalId ?? "").trim();
  if (!normalizedSignalId) {
    throw new SourceFormationAssessmentError("source_signal_id_required", "Source Signal id is required", { status: 400 });
  }

  await requireSourceIdentity(serviceClient, normalizedSignalId);
  await requireNonBlindSource(serviceClient, normalizedSignalId);
  const outcome = await requireSingleDurableCandidateOutcome(serviceClient, normalizedSignalId);
  await requireNoDownstreamAssignment(serviceClient, normalizedSignalId);

  const source = await loadFormationSource(serviceClient, normalizedSignalId);
  const classifiedOrigin = classifySourceOrigin(source.canonical_url);
  const formationPlatform = classifiedOrigin?.kind === "external_web"
    ? "external_web"
    : source.source_platform;

  const result = await resolveSourceProblemFormationAudit({
    ...source,
    source_platform: formationPlatform,
  }, {
    env,
    fetchImpl,
    ...(fetchContext ? { fetchContext } : {}),
    ...(judgeContext ? { judgeContext } : {}),
    maxSemanticAttempts: 2,
  });

  return buildCuratorFormationAssessment({
    signalId: normalizedSignalId,
    outcome,
    result,
  });
}
