import { classifySourceAdmission } from "./source-admission-policy.mjs";
import { fetchSourceFullContext } from "./source-full-context-fetch.mjs";
import {
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
  getSourceFullContextProviderConfig,
  judgeSourceFullContextSemantics,
  resolveFullContextSemantic,
} from "./source-full-context-resolution.mjs";

export const SOURCE_FULL_CONTEXT_RECOVERY_VERSION = "source-full-context-recovery-v0.1";
export const SOURCE_FULL_CONTEXT_RECOVERY_MAX_ATTEMPTS = 2;
export const SOURCE_FULL_CONTEXT_RECOVERY_MAX_OUTPUT_TOKENS = 1600;
export const SOURCE_FULL_CONTEXT_RECOVERY_REASON_CODES = Object.freeze([
  "source_full_context_provider_incomplete",
  "source_full_context_invalid_evidence_quote",
]);

const RECOVERY_REASON_SET = new Set(SOURCE_FULL_CONTEXT_RECOVERY_REASON_CODES);

export function isSourceFullContextRecoveryEligible(error) {
  return RECOVERY_REASON_SET.has(String(error?.code ?? ""));
}

export function createSourceFullContextRecoveryFetch(fetchImpl = globalThis.fetch, {
  reasonCode,
  maxOutputTokens = SOURCE_FULL_CONTEXT_RECOVERY_MAX_OUTPUT_TOKENS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!RECOVERY_REASON_SET.has(String(reasonCode ?? ""))) {
    throw new RangeError("reasonCode is not eligible for full-context semantic recovery");
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 800 || maxOutputTokens > 4000) {
    throw new RangeError("maxOutputTokens must be an integer from 800 to 4000");
  }

  return async (url, init = {}) => {
    let body;
    try {
      body = JSON.parse(String(init.body ?? ""));
    } catch {
      return fetchImpl(url, init);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) return fetchImpl(url, init);

    body.max_output_tokens = maxOutputTokens;
    const baseInstructions = String(body.instructions ?? "").trim();
    const recoveryInstruction = reasonCode === "source_full_context_invalid_evidence_quote"
      ? "Recovery attempt: evidence_quote must be copied character-for-character as one contiguous substring from <source_full_post>, or be null. Never paraphrase or normalize whitespace in evidence_quote. Return only the required structured fields."
      : "Recovery attempt: the previous structured response did not complete. Be concise, return only the required structured fields, and avoid unnecessary reasoning or explanation.";
    body.instructions = `${baseInstructions} ${recoveryInstruction}`.trim();

    return fetchImpl(url, {
      ...init,
      body: JSON.stringify(body),
    });
  };
}

export async function runSourceFullContextJudgeWithRecovery(judge, input) {
  if (typeof judge !== "function") throw new TypeError("judge must be a function");

  try {
    const semantic = await judge(input, { attempt: 1, recoveryReasonCode: null });
    return {
      semantic,
      error: null,
      recovery: recoveryMetadata({ attempted: false, attemptCount: 1 }),
    };
  } catch (error) {
    if (!isSourceFullContextRecoveryEligible(error)) {
      return {
        semantic: null,
        error,
        recovery: recoveryMetadata({
          attempted: false,
          attemptCount: 1,
          terminalReasonCode: errorCode(error),
        }),
      };
    }

    const triggerReasonCode = errorCode(error);
    try {
      const semantic = await judge(input, { attempt: 2, recoveryReasonCode: triggerReasonCode });
      return {
        semantic,
        error: null,
        recovery: recoveryMetadata({
          attempted: true,
          recovered: true,
          attemptCount: SOURCE_FULL_CONTEXT_RECOVERY_MAX_ATTEMPTS,
          triggerReasonCode,
        }),
      };
    } catch (recoveryError) {
      return {
        semantic: null,
        error: recoveryError,
        recovery: recoveryMetadata({
          attempted: true,
          recovered: false,
          attemptCount: SOURCE_FULL_CONTEXT_RECOVERY_MAX_ATTEMPTS,
          triggerReasonCode,
          terminalReasonCode: errorCode(recoveryError),
        }),
      };
    }
  }
}

export async function resolveSourceAdmissionWithFullContextRecovery(signal, {
  fetchContext = fetchSourceFullContext,
  judgeContext = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const admission = classifySourceAdmission(signal);
  if (admission.decision !== "review" || !admission.requires_full_context) {
    return {
      version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
      base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
      status: "not_required",
      decision: admission.decision,
      resolved: true,
      admission,
      full_context: null,
      semantic: null,
      recovery: recoveryMetadata({ attempted: false, attemptCount: 0 }),
      reason_codes: [...(admission.reason_codes ?? [])],
    };
  }

  let fullContext;
  try {
    fullContext = await fetchContext(signal, { fetchImpl });
  } catch (error) {
    return unresolvedResult({
      admission,
      fullContext: null,
      reasonCode: errorCode(error, "full_context_fetch_failed"),
      recovery: recoveryMetadata({ attempted: false, attemptCount: 0 }),
    });
  }
  if (fullContext?.status !== "resolved" || !fullContext?.content_text) {
    return unresolvedResult({
      admission,
      fullContext: fullContext ?? null,
      reasonCode: fullContext?.error_code ?? "full_context_unavailable",
      recovery: recoveryMetadata({ attempted: false, attemptCount: 0 }),
    });
  }

  let judge = judgeContext;
  if (!judge) {
    let config;
    try {
      config = getSourceFullContextProviderConfig(env);
    } catch (error) {
      return unresolvedResult({
        admission,
        fullContext,
        reasonCode: errorCode(error, "full_context_judge_failed"),
        recovery: recoveryMetadata({ attempted: false, attemptCount: 0 }),
      });
    }

    judge = (input, control = {}) => judgeSourceFullContextSemantics({
      ...input,
      ...config,
      fetchImpl: control.recoveryReasonCode
        ? createSourceFullContextRecoveryFetch(fetchImpl, { reasonCode: control.recoveryReasonCode })
        : fetchImpl,
    });
  }

  const judged = await runSourceFullContextJudgeWithRecovery(judge, {
    title: fullContext.title ?? admission.title,
    fullText: fullContext.content_text,
    sourcePlatform: signal.source_platform,
  });

  if (judged.error) {
    return unresolvedResult({
      admission,
      fullContext,
      reasonCode: errorCode(judged.error, "full_context_judge_failed"),
      recovery: judged.recovery,
    });
  }

  const final = resolveFullContextSemantic(judged.semantic);
  return {
    version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
    base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: final.resolved ? "resolved" : "unresolved",
    decision: final.decision,
    resolved: final.resolved,
    admission,
    full_context: fullContext,
    semantic: judged.semantic,
    recovery: judged.recovery,
    reason_codes: final.reason_codes,
  };
}

function unresolvedResult({ admission, fullContext, reasonCode, recovery }) {
  return {
    version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
    base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: "unresolved",
    decision: "review",
    resolved: false,
    admission,
    full_context: fullContext,
    semantic: null,
    recovery,
    reason_codes: [reasonCode],
  };
}

function recoveryMetadata({
  attempted,
  recovered = false,
  attemptCount,
  triggerReasonCode = null,
  terminalReasonCode = null,
}) {
  return {
    version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
    attempted: Boolean(attempted),
    recovered: Boolean(recovered),
    attempt_count: Number(attemptCount ?? 0),
    trigger_reason_code: triggerReasonCode,
    terminal_reason_code: terminalReasonCode,
  };
}

function errorCode(error, fallback = "full_context_judge_failed") {
  return typeof error?.code === "string" && error.code.trim() ? error.code : fallback;
}
