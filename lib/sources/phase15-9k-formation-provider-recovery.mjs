import { createHash } from "node:crypto";

import { PHASE15_9I_CANDIDATE_AUTHORITY } from "./phase15-9i-confirmed-fn-outcome-persistence.mjs";

export const PHASE15_9K_VERSION = "phase15.9k-formation-provider-recovery-v0.1";
export const PHASE15_9K_BASELINE_PHASE = "15.9J";
export const PHASE15_9K_TARGET_ORDINALS = Object.freeze([9, 16]);
export const PHASE15_9K_TARGET_COUNT = PHASE15_9K_TARGET_ORDINALS.length;
export const PHASE15_9K_BASELINE_REASON = "source_formation_provider_incomplete";
export const PHASE15_9K_FETCHES_PER_SOURCE = 2;
export const PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS = PHASE15_9K_TARGET_COUNT * PHASE15_9K_FETCHES_PER_SOURCE * 4;
export const PHASE15_9K_MAX_MODEL_CALLS = PHASE15_9K_TARGET_COUNT * 2;
export const PHASE15_9K_BASE_MAX_OUTPUT_TOKENS = 1200;
export const PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS = 2400;
export const PHASE15_9K_EXPECTED_OUTCOME_TOTAL = 85;

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

export function selectPhase15_9KTargets(validatedPhase15_9JTargets) {
  if (!Array.isArray(validatedPhase15_9JTargets)) throw new TypeError("validated Phase 15.9J targets are required");
  const byOrdinal = new Map(validatedPhase15_9JTargets.map((target) => [target.baseline_ordinal, target]));
  return PHASE15_9K_TARGET_ORDINALS.map((ordinal) => {
    const target = byOrdinal.get(ordinal);
    if (!target) throw new RangeError(`Missing Phase 15.9K target ordinal ${ordinal}`);
    const authority = PHASE15_9I_CANDIDATE_AUTHORITY[ordinal];
    if (target.h_authority?.context_hash !== authority.context_hash) {
      throw new RangeError(`Phase 15.9K ordinal ${ordinal} context authority drifted`);
    }
    return target;
  });
}

export function createPhase15_9KRecoveryFetch(fetchImpl = globalThis.fetch, {
  maxOutputTokens = PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
  onProviderMetadata = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1200 || maxOutputTokens > 4000) {
    throw new RangeError("Phase 15.9K recovery max output tokens must be 1200..4000");
  }
  return createInstrumentedFetch(fetchImpl, {
    recovery: true,
    maxOutputTokens,
    onProviderMetadata,
  });
}

export function createPhase15_9KBaselineFetch(fetchImpl = globalThis.fetch, {
  onProviderMetadata = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  return createInstrumentedFetch(fetchImpl, {
    recovery: false,
    maxOutputTokens: null,
    onProviderMetadata,
  });
}

export async function runPhase15_9KFormationJudgeWithRecovery(judge, input) {
  if (typeof judge !== "function") throw new TypeError("judge must be a function");
  try {
    const semantic = await judge(input, { attempt: 1, recovery: false });
    return {
      semantic,
      error: null,
      recovery: recoveryMetadata({ attempted: false, recovered: false, attemptCount: 1 }),
    };
  } catch (error) {
    const eligible = error?.code === PHASE15_9K_BASELINE_REASON && error?.retryable === true;
    if (!eligible) {
      return {
        semantic: null,
        error,
        recovery: recoveryMetadata({
          attempted: false,
          recovered: false,
          attemptCount: 1,
          terminalReasonCode: errorCode(error),
        }),
      };
    }

    try {
      const semantic = await judge(input, { attempt: 2, recovery: true });
      return {
        semantic,
        error: null,
        recovery: recoveryMetadata({
          attempted: true,
          recovered: true,
          attemptCount: 2,
          triggerReasonCode: PHASE15_9K_BASELINE_REASON,
        }),
      };
    } catch (recoveryError) {
      return {
        semantic: null,
        error: recoveryError,
        recovery: recoveryMetadata({
          attempted: true,
          recovered: false,
          attemptCount: 2,
          triggerReasonCode: PHASE15_9K_BASELINE_REASON,
          terminalReasonCode: errorCode(recoveryError),
        }),
      };
    }
  }
}

export function safePhase15_9KSemantic(semantic, fullText) {
  if (!semantic) return null;
  const quote = typeof semantic.evidence_quote === "string" ? semantic.evidence_quote : null;
  return {
    problem_claim: semantic.problem_claim,
    experience_actor: semantic.experience_actor,
    friction_specificity: semantic.friction_specificity,
    pain_centrality: semantic.pain_centrality,
    content_kind: semantic.content_kind,
    source_origin: semantic.source_origin,
    friction_responsibility: semantic.friction_responsibility,
    evidence_quote_sha256: quote ? sha256(quote) : null,
    evidence_quote_char_count: quote?.length ?? 0,
    evidence_quote_grounded: Boolean(quote && String(fullText ?? "").includes(quote)),
    prompt_version: semantic.prompt_version ?? null,
    provider: semantic.provider ?? null,
    model: semantic.model ?? null,
  };
}

export function summarizePhase15_9K(results) {
  const summary = {
    total: results.length,
    context_integrity_passed: 0,
    context_drift: 0,
    baseline_resolved: 0,
    provider_recovery_attempted: 0,
    provider_recovered_after_budgeted_retry: 0,
    provider_recovery_exhausted: 0,
    eligible: 0,
    provenance_review: 0,
    review: 0,
    reject: 0,
    unresolved: 0,
    terminal_reason_counts: {},
    incomplete_detail_reason_counts: {},
  };

  for (const item of results) {
    if (item.context_integrity_ok) summary.context_integrity_passed += 1;
    else summary.context_drift += 1;
    if (item.baseline_resolved) summary.baseline_resolved += 1;
    if (item.recovery?.attempted) summary.provider_recovery_attempted += 1;
    if (item.recovery?.attempted && item.recovery?.recovered) summary.provider_recovered_after_budgeted_retry += 1;
    if (item.recovery?.attempted && !item.recovery?.recovered) summary.provider_recovery_exhausted += 1;

    const state = item.formation_state;
    if (["eligible", "provenance_review", "review", "reject"].includes(state)) summary[state] += 1;
    if (!item.resolved) summary.unresolved += 1;

    const terminal = item.recovery?.terminal_reason_code;
    if (terminal) summary.terminal_reason_counts[terminal] = (summary.terminal_reason_counts[terminal] ?? 0) + 1;
    for (const attempt of item.provider_attempts ?? []) {
      const reason = attempt.incomplete_reason;
      if (reason) summary.incomplete_detail_reason_counts[reason] = (summary.incomplete_detail_reason_counts[reason] ?? 0) + 1;
    }
  }
  return summary;
}

export function determinePhase15_9KConclusion(summary) {
  if (summary.context_drift > 0) return "formation_provider_reproduction_blocked_by_context_drift";
  if (summary.provider_recovered_after_budgeted_retry > 0) return "formation_provider_incomplete_recoverable_with_bounded_output_budget";
  if (summary.baseline_resolved === summary.total) return "formation_provider_incomplete_not_reproduced";
  if (summary.provider_recovery_exhausted > 0) return "formation_provider_incomplete_persists_after_bounded_recovery";
  return "formation_provider_recovery_inconclusive";
}

function createInstrumentedFetch(fetchImpl, { recovery, maxOutputTokens, onProviderMetadata }) {
  return async (url, init = {}) => {
    let body = null;
    try {
      body = JSON.parse(String(init.body ?? ""));
    } catch {
      body = null;
    }

    let nextInit = init;
    let requestedMaxOutputTokens = Number(body?.max_output_tokens ?? 0) || null;
    if (recovery && body && typeof body === "object" && !Array.isArray(body)) {
      body.max_output_tokens = maxOutputTokens;
      requestedMaxOutputTokens = maxOutputTokens;
      const baseInstructions = String(body.instructions ?? "").trim();
      const recoveryInstruction = "Recovery attempt: the prior structured Formation response was incomplete. Return only the required structured fields, keep proposals concise, and avoid unnecessary reasoning or explanation.";
      body.instructions = `${baseInstructions} ${recoveryInstruction}`.trim();
      nextInit = { ...init, body: JSON.stringify(body) };
    }

    const response = await fetchImpl(url, nextInit);
    let payload = null;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
    if (typeof onProviderMetadata === "function") {
      onProviderMetadata({
        recovery,
        requested_max_output_tokens: requestedMaxOutputTokens,
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

function recoveryMetadata({ attempted, recovered, attemptCount, triggerReasonCode = null, terminalReasonCode = null }) {
  return {
    attempted: Boolean(attempted),
    recovered: Boolean(recovered),
    attempt_count: Number(attemptCount ?? 0),
    trigger_reason_code: triggerReasonCode,
    terminal_reason_code: terminalReasonCode,
  };
}

function errorCode(error, fallback = "source_formation_judge_failed") {
  return typeof error?.code === "string" && error.code.trim() ? error.code : fallback;
}
