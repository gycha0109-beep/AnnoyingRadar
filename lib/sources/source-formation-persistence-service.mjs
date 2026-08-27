import { getEvaluationSampleIds } from "./blind-evaluation.mjs";
import { classifySourceOrigin } from "./source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
} from "./source-full-context-fetch.mjs";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "./source-full-context-outcome-persistence.mjs";
import {
  persistSourceFormationAssessment,
  SOURCE_FORMATION_ASSESSMENT_TABLE,
  validateFormationContextAgainstAdmission,
} from "./source-formation-assessment-persistence.mjs";
import { SourceFormationAssessmentError } from "./source-formation-service.mjs";
import {
  getSourceProblemFormationProviderConfig,
  resolveSourceProblemFormationAudit,
} from "./source-problem-formation-observer.mjs";

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
}

async function requireNonBlindSource(serviceClient, signalId) {
  const blindIds = await getEvaluationSampleIds(serviceClient);
  if (blindIds.has(signalId)) {
    throw new SourceFormationAssessmentError(
      "source_formation_blind_member_blocked",
      "Blind evaluation Sources cannot receive durable Formation assessments",
      { status: 409 },
    );
  }
}

async function requireSingleDurableCandidateOutcome(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .select("id, outcome_schema_version, batch_version, source_signal_id, status, decision, reason_codes, context_status, context_scope, context_content_sha256, context_char_count, context_truncated, evaluated_at, created_at")
    .eq("source_signal_id", signalId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) {
    throw new SourceFormationAssessmentError(
      "source_formation_durable_outcome_required",
      "Formation persistence requires a durable full-context Source Admission outcome",
      { status: 409 },
    );
  }
  if (rows.length !== 1) {
    throw new SourceFormationAssessmentError(
      "source_formation_durable_outcome_ambiguous",
      "Formation persistence fails closed when multiple durable Source Admission outcomes exist",
      { status: 409 },
    );
  }
  const outcome = rows[0];
  if (outcome.status !== "resolved" || outcome.decision !== "candidate") {
    throw new SourceFormationAssessmentError(
      "source_formation_candidate_required",
      "Only a resolved durable Source Admission Candidate may receive a Formation assessment",
      { status: 409 },
    );
  }
  if (outcome.context_status !== "resolved" || outcome.context_scope !== "full_post" || outcome.context_truncated) {
    throw new SourceFormationAssessmentError(
      "source_formation_admission_context_not_complete",
      "Durable Formation persistence requires complete untruncated Source Admission context authority",
      { status: 409 },
    );
  }
  return outcome;
}

async function requireNoExistingBatchAssessment(serviceClient, signalId, assessmentBatchVersion) {
  const { data, error } = await serviceClient
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .select("id")
    .eq("source_signal_id", signalId)
    .eq("assessment_batch_version", assessmentBatchVersion)
    .limit(1);
  if (error) throw error;
  if ((data ?? []).length > 0) {
    throw new SourceFormationAssessmentError(
      "source_formation_assessment_batch_already_persisted",
      "This Source already has a durable Formation assessment in the requested batch",
      { status: 409 },
    );
  }
}

async function requireNoDownstreamAssignment(serviceClient, signalId) {
  const [{ data: links, error: linkError }, { data: evidence, error: evidenceError }] = await Promise.all([
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
  if ((links ?? []).length > 0 || (evidence ?? []).length > 0) {
    throw new SourceFormationAssessmentError(
      "source_formation_downstream_assignment_exists",
      "Source already has downstream Incident or Public Evidence authority",
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

function fetchFormationFullContext(signal, { fetchImpl = globalThis.fetch } = {}) {
  return fetchSourceFullContext(signal, {
    fetchImpl,
    externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
  });
}

export async function persistFormationAssessmentForCurator(serviceClient, {
  signalId,
  assessmentBatchVersion,
  env = process.env,
  fetchImpl = globalThis.fetch,
  fetchContext,
  judgeContext,
} = {}) {
  const normalizedSignalId = String(signalId ?? "").trim();
  const normalizedBatchVersion = String(assessmentBatchVersion ?? "").trim();
  if (!normalizedSignalId) {
    throw new SourceFormationAssessmentError("source_signal_id_required", "Source Signal id is required", { status: 400 });
  }
  if (!normalizedBatchVersion || normalizedBatchVersion.length > 160) {
    throw new SourceFormationAssessmentError(
      "source_formation_assessment_batch_required",
      "A bounded Formation assessment batch version is required",
      { status: 400 },
    );
  }

  await requireSourceIdentity(serviceClient, normalizedSignalId);
  await requireNonBlindSource(serviceClient, normalizedSignalId);
  const admission = await requireSingleDurableCandidateOutcome(serviceClient, normalizedSignalId);
  await requireNoExistingBatchAssessment(serviceClient, normalizedSignalId, normalizedBatchVersion);
  await requireNoDownstreamAssignment(serviceClient, normalizedSignalId);

  const source = await loadFormationSource(serviceClient, normalizedSignalId);
  const classifiedOrigin = classifySourceOrigin(source.canonical_url);
  const formationPlatform = classifiedOrigin?.kind === "external_web"
    ? "external_web"
    : source.source_platform;

  const contextLoader = fetchContext ?? fetchFormationFullContext;
  const integrityBoundContextLoader = async (signal, options = {}) => {
    const fullContext = await contextLoader(signal, options);
    try {
      validateFormationContextAgainstAdmission(admission, fullContext);
    } catch (error) {
      throw new SourceFormationAssessmentError(
        "source_formation_context_drift",
        error?.message ?? "Formation context drifted from Source Admission authority",
        { status: 409 },
      );
    }
    return fullContext;
  };

  let configuredModel = null;
  if (!judgeContext) {
    configuredModel = getSourceProblemFormationProviderConfig(env).model;
  }
  const result = await resolveSourceProblemFormationAudit({
    ...source,
    source_platform: formationPlatform,
  }, {
    env,
    fetchImpl,
    fetchContext: integrityBoundContextLoader,
    ...(judgeContext ? { judgeContext } : {}),
    maxSemanticAttempts: 2,
  });

  const persisted = await persistSourceFormationAssessment({
    client: serviceClient,
    assessmentBatchVersion: normalizedBatchVersion,
    sourceSignalId: normalizedSignalId,
    sourceAdmissionOutcome: admission,
    result,
    configuredModel,
  });

  return {
    authority: "durable_formation_assessment_not_incident_authority",
    persisted,
    formation: {
      observer_version: result.version,
      status: result.status,
      formation_state: result.formation_state,
      resolved: result.resolved,
      reason_codes: [...(result.reason_codes ?? [])],
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
