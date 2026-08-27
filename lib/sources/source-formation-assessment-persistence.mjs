import { createHash } from "node:crypto";

import { createServiceClient } from "../supabase/service.js";
import { SOURCE_FORMATION_ASSESSMENT_VERSION } from "./source-formation-service.mjs";
import { SOURCE_PROBLEM_FORMATION_VERSION } from "./source-problem-formation.mjs";

export const SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION = "source-formation-assessment-outcome-v0.1";
export const SOURCE_FORMATION_ASSESSMENT_TABLE = "ar_source_formation_assessments";

const STATUS_VALUES = new Set(["resolved", "unresolved"]);
const FORMATION_STATE_VALUES = new Set(["eligible", "provenance_review", "review", "reject"]);
const PROBLEM_CLAIM_VALUES = new Set(["yes", "no", "unclear"]);
const EXPERIENCE_ACTOR_VALUES = new Set(["self", "specific_other", "reported_population", "generic", "unknown"]);
const FRICTION_SPECIFICITY_VALUES = new Set(["concrete", "vague", "none", "unknown"]);
const PAIN_CENTRALITY_VALUES = new Set(["central", "incidental", "unclear"]);
const CONTENT_KIND_VALUES = new Set(["organic", "news", "repost", "informational", "advertisement", "unknown"]);
const SOURCE_ORIGIN_VALUES = new Set(["original", "derivative", "unknown"]);
const FRICTION_RESPONSIBILITY_VALUES = new Set([
  "external_service_or_product",
  "external_process_or_policy",
  "structural_system",
  "contractual_term",
  "self_caused",
  "natural_event_only",
  "mixed",
  "unknown",
]);

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

function requiredText(value, name, maxLength = 160) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new RangeError(`${name} must be a non-empty string up to ${maxLength} characters`);
  }
  return normalized;
}

function optionalText(value, maxLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (maxLength && normalized.length > maxLength) return normalized.slice(0, maxLength);
  return normalized;
}

function enumValue(value, allowed, name) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) throw new RangeError(`${name} is not a supported value`);
  return normalized;
}

function normalizeReasonCodes(value) {
  const reasons = [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean))];
  if (reasons.length < 1 || reasons.length > 12) {
    throw new RangeError("reason_codes must contain 1 to 12 non-empty values");
  }
  return reasons;
}

export function validateFormationContextAgainstAdmission(sourceAdmissionOutcome, fullContext) {
  if (!sourceAdmissionOutcome?.id) throw new RangeError("sourceAdmissionOutcome.id is required");
  if (sourceAdmissionOutcome.status !== "resolved" || sourceAdmissionOutcome.decision !== "candidate") {
    throw new RangeError("Formation persistence requires a resolved Candidate Source Admission outcome");
  }
  if (sourceAdmissionOutcome.context_status !== "resolved" || sourceAdmissionOutcome.context_scope !== "full_post") {
    throw new RangeError("Source Admission outcome must carry resolved full-post context authority");
  }
  if (sourceAdmissionOutcome.context_truncated) {
    throw new RangeError("Formation persistence requires an untruncated Source Admission context");
  }
  if (fullContext?.status !== "resolved" || fullContext?.content_scope !== "full_post") {
    throw new RangeError("Formation persistence requires currently resolved full-post context");
  }
  if (fullContext.truncated) {
    throw new RangeError("Formation persistence requires untruncated current context");
  }

  const contentText = String(fullContext.content_text ?? "");
  if (contentText.length < 20) throw new RangeError("Formation context must contain at least 20 characters");
  const currentHash = sha256(contentText);
  const upstreamHash = requiredText(sourceAdmissionOutcome.context_content_sha256, "sourceAdmissionContextHash", 64);
  const upstreamChars = Number(sourceAdmissionOutcome.context_char_count);
  if (currentHash !== upstreamHash || contentText.length !== upstreamChars) {
    throw new RangeError("Formation context drifted from durable Source Admission authority");
  }
  return {
    context_status: "resolved",
    context_scope: "full_post",
    context_content_sha256: currentHash,
    context_char_count: contentText.length,
    context_truncated: false,
    context_extraction_scope: optionalText(fullContext.extraction_scope, 120),
  };
}

function semanticMetadata(result) {
  const semantic = result?.semantic ?? null;
  const fields = {
    problem_claim: enumValue(semantic?.problem_claim, PROBLEM_CLAIM_VALUES, "problem_claim"),
    experience_actor: enumValue(semantic?.experience_actor, EXPERIENCE_ACTOR_VALUES, "experience_actor"),
    friction_specificity: enumValue(semantic?.friction_specificity, FRICTION_SPECIFICITY_VALUES, "friction_specificity"),
    pain_centrality: enumValue(semantic?.pain_centrality, PAIN_CENTRALITY_VALUES, "pain_centrality"),
    content_kind: enumValue(semantic?.content_kind, CONTENT_KIND_VALUES, "content_kind"),
    source_origin: enumValue(semantic?.source_origin, SOURCE_ORIGIN_VALUES, "source_origin"),
    friction_responsibility: enumValue(
      semantic?.friction_responsibility,
      FRICTION_RESPONSIBILITY_VALUES,
      "friction_responsibility",
    ),
  };
  const count = Object.values(fields).filter((value) => value !== null).length;
  if (![0, 7].includes(count)) throw new RangeError("Formation semantic fields must be either complete or absent");
  if (result?.status === "resolved" && count !== 7) {
    throw new RangeError("resolved Formation assessment requires complete semantic facts");
  }
  return { semantic, fields };
}

function evidenceQuoteMetadata(semantic, fullContext) {
  const quote = typeof semantic?.evidence_quote === "string" && semantic.evidence_quote.trim()
    ? semantic.evidence_quote.trim()
    : null;
  if (!quote) {
    return {
      evidence_quote_sha256: null,
      evidence_quote_char_count: 0,
      evidence_quote_start: null,
      evidence_quote_end: null,
      evidence_quote_grounded: false,
    };
  }

  const fullText = String(fullContext?.content_text ?? "");
  const start = fullText.indexOf(quote);
  if (start < 0) throw new RangeError("Formation evidence quote is not grounded in the exact full context");
  return {
    evidence_quote_sha256: sha256(quote),
    evidence_quote_char_count: quote.length,
    evidence_quote_start: start,
    evidence_quote_end: start + quote.length,
    evidence_quote_grounded: true,
  };
}

function recoveryMetadata(result) {
  const recovery = result?.recovery ?? null;
  if (!recovery) {
    return {
      recovery_version: null,
      recovery_attempted: false,
      recovery_recovered: false,
      recovery_attempt_count: 0,
      recovery_trigger_reason_code: null,
    };
  }
  const attemptCount = Number.isInteger(recovery.attempt_count) ? recovery.attempt_count : 0;
  if (attemptCount < 0 || attemptCount > 2) throw new RangeError("recovery attempt_count must be between 0 and 2");
  if (recovery.attempted && attemptCount !== 2) throw new RangeError("attempted Formation recovery must report exactly two attempts");
  if (recovery.attempted && recovery.trigger_reason_code !== "source_formation_provider_incomplete") {
    throw new RangeError("Formation recovery may only be triggered by provider-incomplete");
  }
  return {
    recovery_version: optionalText(recovery.version, 120),
    recovery_attempted: Boolean(recovery.attempted),
    recovery_recovered: Boolean(recovery.recovered),
    recovery_attempt_count: attemptCount,
    recovery_trigger_reason_code: optionalText(recovery.trigger_reason_code, 160),
  };
}

export function buildSourceFormationAssessmentRow({
  assessmentBatchVersion,
  sourceSignalId,
  sourceAdmissionOutcome,
  result,
  configuredProvider = "openai",
  configuredModel,
}) {
  if (!result || typeof result !== "object") throw new TypeError("result is required");
  const status = String(result.status ?? "").trim();
  const formationState = String(result.formation_state ?? "").trim();
  const resolved = Boolean(result.resolved);
  if (!STATUS_VALUES.has(status)) throw new RangeError("Formation status must be resolved/unresolved");
  if (!FORMATION_STATE_VALUES.has(formationState)) throw new RangeError("unsupported Formation state");
  const validShape = (
    status === "resolved"
    && resolved
    && ["eligible", "provenance_review", "reject"].includes(formationState)
  ) || (
    status === "unresolved"
    && !resolved
    && formationState === "review"
  );
  if (!validShape) throw new RangeError("Formation status/state/resolved contract is invalid");

  const context = validateFormationContextAgainstAdmission(sourceAdmissionOutcome, result.full_context);
  const { semantic, fields } = semanticMetadata(result);
  const quote = evidenceQuoteMetadata(semantic, result.full_context);

  return {
    assessment_schema_version: SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
    assessment_batch_version: requiredText(assessmentBatchVersion, "assessmentBatchVersion"),
    source_signal_id: requiredText(sourceSignalId, "sourceSignalId", 80),
    source_admission_outcome_id: requiredText(sourceAdmissionOutcome.id, "sourceAdmissionOutcomeId", 80),
    source_admission_outcome_schema_version: requiredText(
      sourceAdmissionOutcome.outcome_schema_version,
      "sourceAdmissionOutcomeSchemaVersion",
      120,
    ),
    source_admission_batch_version: requiredText(sourceAdmissionOutcome.batch_version, "sourceAdmissionBatchVersion"),
    assessment_version: SOURCE_FORMATION_ASSESSMENT_VERSION,
    observer_version: requiredText(result.version, "observerVersion", 120),
    formation_version: SOURCE_PROBLEM_FORMATION_VERSION,
    status,
    formation_state: formationState,
    resolved,
    reason_codes: normalizeReasonCodes(result.reason_codes),
    ...fields,
    ...quote,
    problem_mechanism_proposal: optionalText(semantic?.problem_mechanism_proposal, 240),
    incident_summary_proposal: optionalText(semantic?.incident_summary_proposal, 320),
    ...context,
    prompt_version: requiredText(semantic?.prompt_version, "promptVersion", 120),
    provider: requiredText(semantic?.provider ?? configuredProvider, "provider", 80),
    model_name: requiredText(semantic?.model ?? result.configured_model ?? configuredModel, "modelName", 160),
    ...recoveryMetadata(result),
  };
}

export async function persistSourceFormationAssessment({
  client = null,
  assessmentBatchVersion,
  sourceSignalId,
  sourceAdmissionOutcome,
  result,
  configuredProvider = "openai",
  configuredModel,
}) {
  const service = client ?? createServiceClient();
  const row = buildSourceFormationAssessmentRow({
    assessmentBatchVersion,
    sourceSignalId,
    sourceAdmissionOutcome,
    result,
    configuredProvider,
    configuredModel,
  });
  const { data, error } = await service
    .from(SOURCE_FORMATION_ASSESSMENT_TABLE)
    .insert(row)
    .select("id, assessment_schema_version, assessment_batch_version, source_signal_id, source_admission_outcome_id, status, formation_state, resolved, reason_codes, context_content_sha256, context_char_count, evidence_quote_sha256, evidence_quote_char_count, evidence_quote_start, evidence_quote_end, recovery_attempted, recovery_recovered, recovery_attempt_count, evaluated_at, created_at")
    .single();
  if (error) throw error;
  return data;
}
