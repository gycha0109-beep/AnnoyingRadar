import { createHash } from "node:crypto";

import { getEvaluationSampleIds } from "./blind-evaluation.mjs";
import { classifySourceOrigin } from "./source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "./source-full-context-fetch.mjs";
import { SOURCE_FORMATION_ASSESSMENT_TABLE } from "./source-formation-assessment-persistence.mjs";

export const SOURCE_INCIDENT_DECISION_PACKET_VERSION = "source-incident-decision-packet-v0.1";

export class SourceIncidentDecisionPacketError extends Error {
  constructor(code, message, { status = 409 } = {}) {
    super(message);
    this.name = "SourceIncidentDecisionPacketError";
    this.code = code;
    this.status = status;
  }
}

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

async function requireSourceIdentity(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id")
    .eq("id", signalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new SourceIncidentDecisionPacketError("source_signal_not_found", "Source Signal not found", { status: 404 });
  }
}

async function requireNonBlindSource(serviceClient, signalId) {
  const blindIds = await getEvaluationSampleIds(serviceClient);
  if (blindIds.has(signalId)) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_blind_member_blocked",
      "Blind evaluation Sources cannot enter curator Incident decision packets",
    );
  }
}

async function requireExplicitFormationAssessment(serviceClient, { signalId, assessmentId }) {
  const { data, error } = await serviceClient
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select([
      "id",
      "assessment_schema_version",
      "assessment_batch_version",
      "source_signal_id",
      "source_admission_outcome_id",
      "source_admission_outcome_schema_version",
      "source_admission_batch_version",
      "assessment_version",
      "observer_version",
      "formation_version",
      "status",
      "formation_state",
      "resolved",
      "reason_codes",
      "problem_claim",
      "experience_actor",
      "friction_specificity",
      "pain_centrality",
      "content_kind",
      "source_origin",
      "friction_responsibility",
      "evidence_quote_sha256",
      "evidence_quote_char_count",
      "evidence_quote_start",
      "evidence_quote_end",
      "evidence_quote_grounded",
      "problem_mechanism_proposal",
      "incident_summary_proposal",
      "context_status",
      "context_scope",
      "context_content_sha256",
      "context_char_count",
      "context_truncated",
      "context_extraction_scope",
      "prompt_version",
      "provider",
      "model_name",
      "recovery_version",
      "recovery_attempted",
      "recovery_recovered",
      "recovery_attempt_count",
      "recovery_trigger_reason_code",
      "evaluated_at",
      "created_at",
    ].join(","))
    .eq("id", assessmentId)
    .eq("source_signal_id", signalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new SourceIncidentDecisionPacketError(
      "source_formation_assessment_not_found",
      "The explicit Formation assessment was not found for this Source",
      { status: 404 },
    );
  }
  if (data.status !== "resolved" || data.resolved !== true || data.formation_state !== "eligible") {
    throw new SourceIncidentDecisionPacketError(
      "source_formation_eligible_assessment_required",
      "Curator Incident decision packets require an explicit resolved eligible Formation assessment",
    );
  }
  if (data.context_status !== "resolved" || data.context_scope !== "full_post" || data.context_truncated !== false) {
    throw new SourceIncidentDecisionPacketError(
      "source_formation_complete_context_required",
      "Curator Incident decision packets require complete durable Formation context authority",
    );
  }
  if (
    data.evidence_quote_grounded !== true
    || !data.evidence_quote_sha256
    || !Number.isInteger(data.evidence_quote_start)
    || !Number.isInteger(data.evidence_quote_end)
    || !Number.isInteger(data.evidence_quote_char_count)
    || data.evidence_quote_char_count <= 0
  ) {
    throw new SourceIncidentDecisionPacketError(
      "source_formation_grounded_evidence_required",
      "Eligible Formation assessment must carry reconstructable grounded evidence authority",
    );
  }
  return data;
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
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_downstream_assignment_exists",
      "Source already has Incident or Public Evidence authority and cannot enter a new Incident decision packet",
    );
  }
}

async function loadDecisionSource(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, raw_text, author_handle, published_at, source_origin_kind, source_origin_host, source_origin_classifier_version")
    .eq("id", signalId)
    .single();
  if (error) throw error;
  return data;
}

function fetchDecisionFullContext(signal, { fetchImpl = globalThis.fetch } = {}) {
  return fetchSourceFullContext(signal, {
    fetchImpl,
    externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
  });
}

export function validateDecisionPacketContext(assessment, fullContext) {
  if (fullContext?.status !== "resolved" || fullContext?.content_scope !== "full_post") {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_context_unresolved",
      "Current full context must resolve as a full post",
    );
  }
  if (fullContext.truncated) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_context_truncated",
      "Current full context must be untruncated",
    );
  }
  const contentText = String(fullContext.content_text ?? "");
  const contentHash = sha256(contentText);
  if (contentHash !== fullContext.content_hash) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_fetch_hash_mismatch",
      "Current fetched text does not match its declared content hash",
    );
  }
  if (
    contentHash !== assessment.context_content_sha256
    || contentText.length !== assessment.context_char_count
    || fullContext.original_char_count !== assessment.context_char_count
  ) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_context_drift",
      "Current full context drifted from the explicit durable Formation assessment",
    );
  }

  const start = assessment.evidence_quote_start;
  const end = assessment.evidence_quote_end;
  const expectedCount = assessment.evidence_quote_char_count;
  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end <= start
    || end > contentText.length
    || end - start !== expectedCount
  ) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_quote_offsets_invalid",
      "Durable evidence quote offsets are invalid for the exact current context",
    );
  }
  const evidenceQuote = contentText.slice(start, end);
  if (evidenceQuote.length !== expectedCount || sha256(evidenceQuote) !== assessment.evidence_quote_sha256) {
    throw new SourceIncidentDecisionPacketError(
      "source_incident_decision_quote_hash_mismatch",
      "Reconstructed evidence quote does not match durable Formation authority",
    );
  }

  return {
    content_text: contentText,
    evidence_quote: evidenceQuote,
  };
}

async function loadExistingIncidentAuthority(serviceClient) {
  const [{ data: incidents, error: incidentError }, { data: links, error: linkError }] = await Promise.all([
    serviceClient
      .from("ar_source_incidents")
      .select("id, incident_key, label, created_at, updated_at")
      .order("incident_key", { ascending: true }),
    serviceClient
      .from("ar_source_incident_links")
      .select("incident_id")
      .order("incident_id", { ascending: true }),
  ]);
  if (incidentError) throw incidentError;
  if (linkError) throw linkError;
  const sourceCountByIncident = new Map();
  for (const link of links ?? []) {
    sourceCountByIncident.set(link.incident_id, (sourceCountByIncident.get(link.incident_id) ?? 0) + 1);
  }
  return (incidents ?? []).map((incident) => ({
    incident_id: incident.id,
    incident_key: incident.incident_key,
    label: incident.label,
    source_count: sourceCountByIncident.get(incident.id) ?? 0,
    created_at: incident.created_at ?? null,
    updated_at: incident.updated_at ?? null,
  }));
}

async function loadExistingProblemAuthority(serviceClient) {
  const [{ data: problems, error: problemError }, { data: evidence, error: evidenceError }] = await Promise.all([
    serviceClient
      .from("ar_public_problems")
      .select("id, title, summary, category, status, problem_signature, published_at")
      .order("id", { ascending: true }),
    serviceClient
      .from("ar_public_problem_evidence_snapshots")
      .select("public_problem_id, incident_id")
      .order("public_problem_id", { ascending: true }),
  ]);
  if (problemError) throw problemError;
  if (evidenceError) throw evidenceError;
  return (problems ?? []).map((problem) => {
    const rows = (evidence ?? []).filter((row) => row.public_problem_id === problem.id);
    return {
      public_problem_id: problem.id,
      title: problem.title,
      summary: problem.summary,
      category: problem.category,
      status: problem.status,
      problem_signature: problem.problem_signature ?? null,
      evidence_count: rows.length,
      distinct_incident_count: new Set(rows.map((row) => row.incident_id).filter(Boolean)).size,
      published_at: problem.published_at ?? null,
    };
  });
}

export function buildBlankCuratorIncidentDecisionTemplate({ signalId, assessmentId }) {
  return {
    authority: "blank_curator_incident_decision_template_not_a_decision",
    source_signal_id: signalId,
    formation_assessment_id: assessmentId,
    evidence_decision: null,
    incident_action: null,
    existing_incident_id: null,
    new_incident_key: null,
    new_incident_label: null,
    notes: null,
    persistence_authorized: false,
  };
}

function firstNonEmptyLine(value) {
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export async function buildCuratorIncidentDecisionPacket(serviceClient, {
  signalId,
  formationAssessmentId,
  fetchImpl = globalThis.fetch,
  fetchContext,
} = {}) {
  const normalizedSignalId = String(signalId ?? "").trim();
  const normalizedAssessmentId = String(formationAssessmentId ?? "").trim();
  if (!normalizedSignalId) {
    throw new SourceIncidentDecisionPacketError("source_signal_id_required", "Source Signal id is required", { status: 400 });
  }
  if (!normalizedAssessmentId) {
    throw new SourceIncidentDecisionPacketError(
      "formation_assessment_id_required",
      "An explicit Formation assessment id is required; latest-row inference is not allowed",
      { status: 400 },
    );
  }

  await requireSourceIdentity(serviceClient, normalizedSignalId);
  await requireNonBlindSource(serviceClient, normalizedSignalId);
  const assessment = await requireExplicitFormationAssessment(serviceClient, {
    signalId: normalizedSignalId,
    assessmentId: normalizedAssessmentId,
  });
  await requireNoDownstreamAssignment(serviceClient, normalizedSignalId);

  const source = await loadDecisionSource(serviceClient, normalizedSignalId);
  const classifiedOrigin = classifySourceOrigin(source.canonical_url);
  const contextSource = {
    ...source,
    source_platform: classifiedOrigin?.kind === "external_web" ? "external_web" : source.source_platform,
  };
  const fullContext = await (fetchContext ?? fetchDecisionFullContext)(contextSource, { fetchImpl });
  const exactContext = validateDecisionPacketContext(assessment, fullContext);

  const [existingIncidents, existingProblems] = await Promise.all([
    loadExistingIncidentAuthority(serviceClient),
    loadExistingProblemAuthority(serviceClient),
  ]);

  return {
    version: SOURCE_INCIDENT_DECISION_PACKET_VERSION,
    authority: "curator_incident_decision_packet_not_a_decision",
    source_signal_id: normalizedSignalId,
    formation_assessment_authority: {
      formation_assessment_id: assessment.id,
      assessment_schema_version: assessment.assessment_schema_version,
      assessment_batch_version: assessment.assessment_batch_version,
      source_admission_outcome_id: assessment.source_admission_outcome_id,
      source_admission_outcome_schema_version: assessment.source_admission_outcome_schema_version,
      source_admission_batch_version: assessment.source_admission_batch_version,
      status: assessment.status,
      formation_state: assessment.formation_state,
      reason_codes: [...(assessment.reason_codes ?? [])],
      semantic: {
        problem_claim: assessment.problem_claim,
        experience_actor: assessment.experience_actor,
        friction_specificity: assessment.friction_specificity,
        pain_centrality: assessment.pain_centrality,
        content_kind: assessment.content_kind,
        source_origin: assessment.source_origin,
        friction_responsibility: assessment.friction_responsibility,
      },
      problem_mechanism_proposal: assessment.problem_mechanism_proposal,
      incident_summary_proposal: assessment.incident_summary_proposal,
      context: {
        content_sha256: assessment.context_content_sha256,
        char_count: assessment.context_char_count,
        extraction_scope: assessment.context_extraction_scope,
        truncated: assessment.context_truncated,
      },
      evidence: {
        quote_sha256: assessment.evidence_quote_sha256,
        quote_char_count: assessment.evidence_quote_char_count,
        quote_start: assessment.evidence_quote_start,
        quote_end: assessment.evidence_quote_end,
        quote: exactContext.evidence_quote,
      },
      evaluated_at: assessment.evaluated_at,
      created_at: assessment.created_at,
    },
    source: {
      source_platform: source.source_platform,
      canonical_url: source.canonical_url,
      author_handle: source.author_handle ?? null,
      published_at: source.published_at ?? null,
      title: fullContext.title ?? firstNonEmptyLine(source.raw_text),
      full_context: {
        content_scope: fullContext.content_scope,
        content_hash: fullContext.content_hash,
        original_char_count: fullContext.original_char_count,
        extraction_scope: fullContext.extraction_scope ?? null,
        content_text: exactContext.content_text,
      },
    },
    existing_authority: {
      incidents: existingIncidents,
      public_problems: existingProblems,
    },
    curator_decision_template: buildBlankCuratorIncidentDecisionTemplate({
      signalId: normalizedSignalId,
      assessmentId: normalizedAssessmentId,
    }),
    runtime_posture: {
      model_calls: 0,
      database_writes: 0,
      incident_persistence_authorized: false,
      problem_signature_persistence_authorized: false,
      public_evidence_persistence_authorized: false,
      canonical_problem_persistence_authorized: false,
      publication_authorized: false,
    },
  };
}
