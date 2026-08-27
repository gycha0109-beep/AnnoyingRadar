import { createHash } from "node:crypto";

import {
  PHASE15_9K_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9K_TARGET_ORDINALS,
} from "./phase15-9k-formation-provider-recovery.mjs";
import {
  SOURCE_PROBLEM_FORMATION_BASE_MAX_OUTPUT_TOKENS,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
  SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
  SOURCE_PROBLEM_FORMATION_RECOVERY_MAX_OUTPUT_TOKENS,
  SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION,
} from "./source-problem-formation-observer.mjs";

export const PHASE15_9L_VERSION = "phase15.9l-formation-recovery-policy-promotion-v0.1";
export const PHASE15_9L_TARGET_ORDINALS = PHASE15_9K_TARGET_ORDINALS;
export const PHASE15_9L_TARGET_COUNT = PHASE15_9L_TARGET_ORDINALS.length;
export const PHASE15_9L_EXPECTED_OUTCOME_TOTAL = PHASE15_9K_EXPECTED_OUTCOME_TOTAL;
export const PHASE15_9L_MAX_SOURCE_NETWORK_REQUESTS = PHASE15_9L_TARGET_COUNT * 2 * 4;
export const PHASE15_9L_MAX_MODEL_CALLS = PHASE15_9L_TARGET_COUNT * 2;

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

export function createPhase15_9LObservedProviderFetch(fetchImpl = globalThis.fetch, {
  onAttempt = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  return async (url, init = {}) => {
    let request = null;
    try {
      request = JSON.parse(String(init.body ?? ""));
    } catch {
      request = null;
    }

    const response = await fetchImpl(url, init);
    let payload = null;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }

    if (typeof onAttempt === "function") {
      const instructions = String(request?.instructions ?? "");
      onAttempt({
        requested_max_output_tokens: Number(request?.max_output_tokens) || null,
        recovery_instruction_present: instructions.includes("Recovery attempt: the prior structured Formation response was incomplete."),
        semantic_authority_instruction_present: instructions.includes("You observe semantic facts in one untrusted public source post for a later deterministic Problem Formation gate."),
        http_status: Number(response?.status) || null,
        provider_status: typeof payload?.status === "string" ? payload.status : null,
        incomplete_reason: typeof payload?.incomplete_details?.reason === "string" ? payload.incomplete_details.reason : null,
        output_tokens: Number(payload?.usage?.output_tokens) || null,
        reasoning_tokens: Number(payload?.usage?.output_tokens_details?.reasoning_tokens) || null,
      });
    }
    return response;
  };
}

export function assertPhase15_9LProviderAttemptContract(attempts, recovery) {
  if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 2) {
    throw new RangeError("Phase 15.9L requires one or two provider attempts per evaluated target");
  }
  const first = attempts[0];
  if (first.requested_max_output_tokens !== SOURCE_PROBLEM_FORMATION_BASE_MAX_OUTPUT_TOKENS) {
    throw new RangeError("Phase 15.9L first attempt must preserve the 1200-token Formation budget");
  }
  if (first.recovery_instruction_present) {
    throw new RangeError("Phase 15.9L first attempt must not contain the recovery instruction");
  }
  if (!first.semantic_authority_instruction_present) {
    throw new RangeError("Phase 15.9L first attempt lost the Formation semantic authority instruction");
  }

  const attempted = Boolean(recovery?.attempted);
  if (!attempted && attempts.length !== 1) {
    throw new RangeError("Phase 15.9L observed an unauthorized second provider attempt");
  }
  if (attempted) {
    if (attempts.length !== 2) throw new RangeError("Phase 15.9L recovery metadata requires exactly two provider attempts");
    const second = attempts[1];
    if (second.requested_max_output_tokens !== SOURCE_PROBLEM_FORMATION_RECOVERY_MAX_OUTPUT_TOKENS) {
      throw new RangeError("Phase 15.9L recovery attempt must use the 2400-token budget");
    }
    if (!second.recovery_instruction_present) {
      throw new RangeError("Phase 15.9L recovery attempt must carry the concise recovery instruction");
    }
    if (!second.semantic_authority_instruction_present) {
      throw new RangeError("Phase 15.9L recovery attempt lost the Formation semantic authority instruction");
    }
    if (recovery?.trigger_reason_code !== "source_formation_provider_incomplete") {
      throw new RangeError("Phase 15.9L recovery must be provider-incomplete-only");
    }
  }
  return true;
}

export function buildPhase15_9LArtifactItem({ target, result, attempts }) {
  const semantic = result?.semantic ?? null;
  const quote = typeof semantic?.evidence_quote === "string" ? semantic.evidence_quote : null;
  return {
    baseline_ordinal: target.baseline_ordinal,
    prior_rejection_stratum: target.h_authority.rejection_stratum,
    formation_state: result?.formation_state ?? "review",
    resolved: Boolean(result?.resolved),
    reason_codes: [...(result?.reason_codes ?? [])],
    semantic: semantic ? {
      problem_claim: semantic.problem_claim,
      experience_actor: semantic.experience_actor,
      friction_specificity: semantic.friction_specificity,
      pain_centrality: semantic.pain_centrality,
      content_kind: semantic.content_kind,
      source_origin: semantic.source_origin,
      friction_responsibility: semantic.friction_responsibility,
      evidence_quote_sha256: quote ? sha256(quote) : null,
      evidence_quote_char_count: quote?.length ?? 0,
      evidence_quote_grounded: Boolean(quote && String(result?.full_context?.content_text ?? "").includes(quote)),
      prompt_version: semantic.prompt_version ?? null,
      provider_recovery_version: semantic.provider_recovery_version ?? null,
      provider_recovery_applied: Boolean(semantic.provider_recovery_applied),
      provider: semantic.provider ?? null,
      model: semantic.model ?? null,
    } : null,
    recovery: {
      version: result?.recovery?.version ?? null,
      attempted: Boolean(result?.recovery?.attempted),
      recovered: Boolean(result?.recovery?.recovered),
      attempt_count: Number(result?.recovery?.attempt_count ?? 0),
      trigger_reason_code: result?.recovery?.trigger_reason_code ?? null,
      base_max_output_tokens: result?.recovery?.base_max_output_tokens ?? null,
      recovery_max_output_tokens: result?.recovery?.recovery_max_output_tokens ?? null,
    },
    provider_attempts: attempts.map((attempt, index) => ({
      attempt: index + 1,
      ...attempt,
    })),
  };
}

export function summarizePhase15_9L(items) {
  const summary = {
    total: items.length,
    eligible: 0,
    provenance_review: 0,
    review: 0,
    reject: 0,
    resolved: 0,
    unresolved: 0,
    provider_recovery_attempted: 0,
    provider_recovery_recovered: 0,
    provider_recovery_exhausted: 0,
    incomplete_reason_counts: {},
  };
  for (const item of items) {
    if (["eligible", "provenance_review", "review", "reject"].includes(item.formation_state)) {
      summary[item.formation_state] += 1;
    }
    if (item.resolved) summary.resolved += 1;
    else summary.unresolved += 1;
    if (item.recovery.attempted) summary.provider_recovery_attempted += 1;
    if (item.recovery.attempted && item.recovery.recovered) summary.provider_recovery_recovered += 1;
    if (item.recovery.attempted && !item.recovery.recovered) summary.provider_recovery_exhausted += 1;
    for (const attempt of item.provider_attempts) {
      if (attempt.incomplete_reason) {
        summary.incomplete_reason_counts[attempt.incomplete_reason] = (summary.incomplete_reason_counts[attempt.incomplete_reason] ?? 0) + 1;
      }
    }
  }
  return summary;
}

export function phase15_9LAuthorityManifest() {
  return {
    observer_version: SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
    prompt_version: SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
    recovery_version: SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION,
    base_max_output_tokens: SOURCE_PROBLEM_FORMATION_BASE_MAX_OUTPUT_TOKENS,
    recovery_max_output_tokens: SOURCE_PROBLEM_FORMATION_RECOVERY_MAX_OUTPUT_TOKENS,
    retry_reason: "source_formation_provider_incomplete",
    max_attempts: 2,
    invalid_quote_retry_enabled: false,
    deterministic_formation_policy_changed: false,
  };
}
