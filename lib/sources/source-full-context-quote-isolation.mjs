import { classifySourceAdmission } from "./source-admission-policy.mjs";
import { fetchSourceFullContext } from "./source-full-context-fetch.mjs";
import {
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
  getSourceFullContextProviderConfig,
  judgeSourceFullContextSemantics,
  resolveFullContextSemantic,
} from "./source-full-context-resolution.mjs";

export const SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION = "source-full-context-quote-isolation-v0.1";
export const SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_MAX_ATTEMPTS = 2;
export const SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER = "source_full_context_invalid_evidence_quote";

export function isQuoteIsolationEligible(error) {
  return String(error?.code ?? "") === SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER;
}

export function createQuoteIsolationFetch(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  return async (url, init = {}) => {
    let body;
    try {
      body = JSON.parse(String(init.body ?? ""));
    } catch {
      return fetchImpl(url, init);
    }

    const format = body?.text?.format;
    const schema = format?.schema;
    const properties = schema?.properties;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || format?.type !== "json_schema"
      || format?.strict !== true
      || !schema || typeof schema !== "object"
      || !properties || typeof properties !== "object"
      || !("evidence_quote" in properties)) {
      return fetchImpl(url, init);
    }

    properties.evidence_quote = {
      type: "null",
      description: "Admission classification-only retry: evidence quote is intentionally omitted and carries no provenance authority.",
    };

    const baseInstructions = String(body.instructions ?? "").trim();
    const isolationInstruction = [
      "Quote-isolation retry for Admission classification only.",
      "Set evidence_quote to null exactly.",
      "Do not invent, paraphrase, normalize, repair, or infer any evidence quote.",
      "Classify the other required semantic fields from <source_full_post> under the unchanged semantic definitions.",
      "A later Problem Formation stage, if reached, must independently establish its own exact evidence provenance; this retry grants no Formation evidence authority.",
    ].join(" ");
    body.instructions = `${baseInstructions} ${isolationInstruction}`.trim();

    return fetchImpl(url, {
      ...init,
      body: JSON.stringify(body),
    });
  };
}

export async function runQuoteIsolationJudgeWithRecovery(judge, input) {
  if (typeof judge !== "function") throw new TypeError("judge must be a function");

  try {
    const semantic = await judge(input, { attempt: 1, quoteIsolation: false });
    return {
      semantic,
      error: null,
      isolation: isolationMetadata({ attempted: false, attemptCount: 1 }),
    };
  } catch (error) {
    if (!isQuoteIsolationEligible(error)) {
      return {
        semantic: null,
        error,
        isolation: isolationMetadata({
          attempted: false,
          attemptCount: 1,
          terminalReasonCode: errorCode(error),
        }),
      };
    }

    try {
      const semantic = await judge(input, { attempt: 2, quoteIsolation: true });
      return {
        semantic,
        error: null,
        isolation: isolationMetadata({
          attempted: true,
          recovered: true,
          attemptCount: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_MAX_ATTEMPTS,
          triggerReasonCode: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER,
        }),
      };
    } catch (isolationError) {
      return {
        semantic: null,
        error: isolationError,
        isolation: isolationMetadata({
          attempted: true,
          recovered: false,
          attemptCount: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_MAX_ATTEMPTS,
          triggerReasonCode: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER,
          terminalReasonCode: errorCode(isolationError),
        }),
      };
    }
  }
}

export async function resolveSourceAdmissionWithFullContextQuoteIsolation(signal, {
  fetchContext = fetchSourceFullContext,
  judgeContext = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const admission = classifySourceAdmission(signal);
  if (admission.decision !== "review" || !admission.requires_full_context) {
    return {
      version: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION,
      base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
      status: "not_required",
      decision: admission.decision,
      resolved: true,
      admission,
      full_context: null,
      semantic: null,
      quote_isolation: isolationMetadata({ attempted: false, attemptCount: 0 }),
      formation_quote_authority: "not_granted",
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
      isolation: isolationMetadata({ attempted: false, attemptCount: 0 }),
    });
  }
  if (fullContext?.status !== "resolved" || !fullContext?.content_text) {
    return unresolvedResult({
      admission,
      fullContext: fullContext ?? null,
      reasonCode: fullContext?.error_code ?? "full_context_unavailable",
      isolation: isolationMetadata({ attempted: false, attemptCount: 0 }),
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
        isolation: isolationMetadata({ attempted: false, attemptCount: 0 }),
      });
    }

    judge = (input, control = {}) => judgeSourceFullContextSemantics({
      ...input,
      ...config,
      fetchImpl: control.quoteIsolation ? createQuoteIsolationFetch(fetchImpl) : fetchImpl,
    });
  }

  const judged = await runQuoteIsolationJudgeWithRecovery(judge, {
    title: fullContext.title ?? admission.title,
    fullText: fullContext.content_text,
    sourcePlatform: signal.source_platform,
  });

  if (judged.error) {
    return unresolvedResult({
      admission,
      fullContext,
      reasonCode: errorCode(judged.error, "full_context_judge_failed"),
      isolation: judged.isolation,
    });
  }

  const final = resolveFullContextSemantic(judged.semantic);
  return {
    version: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION,
    base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: final.resolved ? "resolved" : "unresolved",
    decision: final.decision,
    resolved: final.resolved,
    admission,
    full_context: fullContext,
    semantic: judged.semantic,
    quote_isolation: judged.isolation,
    formation_quote_authority: "not_granted",
    reason_codes: final.reason_codes,
  };
}

function unresolvedResult({ admission, fullContext, reasonCode, isolation }) {
  return {
    version: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION,
    base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: "unresolved",
    decision: "review",
    resolved: false,
    admission,
    full_context: fullContext,
    semantic: null,
    quote_isolation: isolation,
    formation_quote_authority: "not_granted",
    reason_codes: [reasonCode],
  };
}

function isolationMetadata({
  attempted,
  recovered = false,
  attemptCount,
  triggerReasonCode = null,
  terminalReasonCode = null,
}) {
  return {
    version: SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION,
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
