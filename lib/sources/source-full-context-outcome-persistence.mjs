import { createHash } from "node:crypto";

import { createServiceClient } from "../supabase/service.js";
import {
  SOURCE_FULL_CONTEXT_PROMPT_VERSION,
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
} from "./source-full-context-resolution.mjs";

export const SOURCE_FULL_CONTEXT_OUTCOME_SCHEMA_VERSION = "source-full-context-outcome-v0.1";
export const SOURCE_FULL_CONTEXT_OUTCOME_TABLE = "ar_source_full_context_resolution_outcomes";

const STATUS_VALUES = new Set(["resolved", "unresolved"]);
const DECISION_VALUES = new Set(["candidate", "reject", "review"]);
const PROBLEM_CLAIM_VALUES = new Set(["yes", "no", "unclear"]);
const EXPERIENCE_ACTOR_VALUES = new Set(["self", "other", "generic", "unknown"]);
const FRICTION_CAUSE_VALUES = new Set(["external_service_or_product", "self_caused", "mixed", "unknown"]);
const FRICTION_SPECIFICITY_VALUES = new Set(["concrete", "vague", "none", "unknown"]);
const PAIN_CENTRALITY_VALUES = new Set(["central", "incidental", "unclear"]);
const CONTENT_KIND_VALUES = new Set(["organic", "advertisement", "informational", "news", "repost", "unknown"]);

function requiredText(value, name, maxLength = 160) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new RangeError(`${name} must be a non-empty string up to ${maxLength} characters`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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

function contextMetadata(fullContext) {
  if (fullContext?.status !== "resolved") {
    return {
      context_status: "unavailable",
      context_scope: null,
      context_content_sha256: null,
      context_char_count: null,
      context_truncated: false,
    };
  }

  if (fullContext?.content_scope !== "full_post") {
    throw new RangeError("resolved full context must have full_post scope");
  }
  const contentText = String(fullContext?.content_text ?? "");
  if (contentText.length < 20) {
    throw new RangeError("resolved full context must contain at least 20 characters");
  }
  return {
    context_status: "resolved",
    context_scope: "full_post",
    context_content_sha256: createHash("sha256").update(contentText).digest("hex"),
    context_char_count: contentText.length,
    context_truncated: Boolean(fullContext?.truncated),
  };
}

function recoveryMetadata(result) {
  const recovery = result?.recovery ?? null;
  if (recovery) {
    const attemptCount = Number.isInteger(recovery.attempt_count) ? recovery.attempt_count : 0;
    if (attemptCount < 0 || attemptCount > 2) throw new RangeError("recovery attempt_count must be between 0 and 2");
    if (recovery.attempted && attemptCount !== 2) throw new RangeError("attempted recovery must report exactly two attempts");
    return {
      recovery_version: optionalText(recovery.version),
      recovery_attempted: Boolean(recovery.attempted),
      recovery_recovered: Boolean(recovery.recovered),
      recovery_attempt_count: attemptCount,
      recovery_trigger_reason_code: optionalText(recovery.trigger_reason_code),
      recovery_terminal_reason_code: optionalText(recovery.terminal_reason_code),
    };
  }

  return {
    recovery_version: null,
    recovery_attempted: false,
    recovery_recovered: false,
    recovery_attempt_count: result?.full_context?.status === "resolved" ? 1 : 0,
    recovery_trigger_reason_code: null,
    recovery_terminal_reason_code: null,
  };
}

export function buildSourceFullContextOutcomeRow({
  batchVersion,
  sourceSignalId,
  result,
  configuredProvider = "openai",
  configuredModel,
}) {
  if (!result || typeof result !== "object") throw new TypeError("result is required");

  const status = String(result.status ?? "").trim();
  const decision = String(result.decision ?? "").trim();
  if (!STATUS_VALUES.has(status)) throw new RangeError("only resolved/unresolved full-context outcomes may be persisted");
  if (!DECISION_VALUES.has(decision)) throw new RangeError("unsupported full-context decision");
  if ((status === "resolved") !== ["candidate", "reject"].includes(decision)) {
    throw new RangeError("resolved outcomes must be candidate/reject and unresolved outcomes must be review");
  }

  const semantic = result.semantic ?? null;
  const semanticFields = {
    problem_claim: enumValue(semantic?.problem_claim, PROBLEM_CLAIM_VALUES, "problem_claim"),
    experience_actor: enumValue(semantic?.experience_actor, EXPERIENCE_ACTOR_VALUES, "experience_actor"),
    friction_cause: enumValue(semantic?.friction_cause, FRICTION_CAUSE_VALUES, "friction_cause"),
    friction_specificity: enumValue(semantic?.friction_specificity, FRICTION_SPECIFICITY_VALUES, "friction_specificity"),
    pain_centrality: enumValue(semantic?.pain_centrality, PAIN_CENTRALITY_VALUES, "pain_centrality"),
    content_kind: enumValue(semantic?.content_kind, CONTENT_KIND_VALUES, "content_kind"),
  };
  const semanticCount = Object.values(semanticFields).filter((value) => value !== null).length;
  if (![0, 6].includes(semanticCount)) throw new RangeError("semantic fields must be either complete or absent");
  if (status === "resolved" && semanticCount !== 6) {
    throw new RangeError("resolved outcome requires complete semantic facts");
  }

  return {
    outcome_schema_version: SOURCE_FULL_CONTEXT_OUTCOME_SCHEMA_VERSION,
    batch_version: requiredText(batchVersion, "batchVersion"),
    source_signal_id: requiredText(sourceSignalId, "sourceSignalId", 80),
    resolution_version: requiredText(
      result.base_resolution_version ?? result.version ?? SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
      "resolutionVersion",
      120,
    ),
    status,
    decision,
    reason_codes: normalizeReasonCodes(result.reason_codes),
    ...semanticFields,
    ...contextMetadata(result.full_context),
    prompt_version: requiredText(semantic?.prompt_version ?? SOURCE_FULL_CONTEXT_PROMPT_VERSION, "promptVersion", 120),
    provider: requiredText(semantic?.provider ?? configuredProvider, "provider", 80),
    model_name: requiredText(semantic?.model ?? configuredModel, "modelName", 160),
    ...recoveryMetadata(result),
  };
}

export async function persistSourceFullContextOutcome({
  client = null,
  batchVersion,
  sourceSignalId,
  result,
  configuredProvider = "openai",
  configuredModel,
}) {
  const service = client ?? createServiceClient();
  const row = buildSourceFullContextOutcomeRow({
    batchVersion,
    sourceSignalId,
    result,
    configuredProvider,
    configuredModel,
  });
  const { data, error } = await service
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .insert(row)
    .select("id, batch_version, source_signal_id, status, decision, reason_codes, evaluated_at, created_at")
    .single();
  if (error) throw error;
  return data;
}
