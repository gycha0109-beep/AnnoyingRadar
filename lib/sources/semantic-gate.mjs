import {
  COMPLAINT_PREFILTER_VERSION,
  runDeterministicComplaintPrefilter,
} from "./complaint-contracts.mjs";
import {
  COMPLAINT_SEMANTIC_VERSION,
  COMPLAINT_SILVER_VERSION,
  needsSecondaryJudge,
  resolveSemanticGate,
} from "./semantic-contracts.mjs";
import {
  getSemanticProviderConfig,
  judgeSourceSignalSemantics,
} from "./semantic-classifier.mjs";

export class SemanticGateError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "SemanticGateError";
    this.code = code;
    this.status = status;
  }
}

export async function classifySourceSignalToSilver(serviceClient, {
  signalId,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const existing = await getSilverAnnotation(serviceClient, signalId);
  if (existing) return existing;

  const { data: signal, error: signalError } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, raw_text, is_quote_post")
    .eq("id", signalId)
    .maybeSingle();
  if (signalError) throw signalError;
  if (!signal) throw new SemanticGateError("source_signal_not_found", "Source Signal not found", { status: 404 });

  const prefilter = runDeterministicComplaintPrefilter(signal);
  if (prefilter.decision === "reject") {
    const resolved = resolveSemanticGate({ prefilter, primary: null, secondary: null });
    return persistSilver(serviceClient, {
      source_signal_id: signal.id,
      silver_version: COMPLAINT_SILVER_VERSION,
      semantic_version: COMPLAINT_SEMANTIC_VERSION,
      annotation_authority: "ai_silver",
      primary_judgment_id: null,
      secondary_judgment_id: null,
      prefilter_decision: prefilter.decision,
      prefilter_reason_codes: prefilter.reason_codes,
      ...resolved.semantic,
      final_decision: resolved.final_decision,
      system_certainty: resolved.system_certainty,
      resolution_reason_codes: [...new Set([...prefilter.reason_codes, ...resolved.resolution_reason_codes])],
    });
  }

  const config = getSemanticProviderConfig(env);
  const primaryResult = await judgeSourceSignalSemantics({
    rawText: signal.raw_text,
    sourcePlatform: signal.source_platform,
    apiKey: config.apiKey,
    model: config.primaryModel,
    judgeStage: "primary",
    timeoutMs: config.timeoutMs,
    fetchImpl,
  });
  const primary = await persistJudgment(serviceClient, signal.id, "primary", primaryResult);

  let secondary = null;
  let secondaryResult = null;
  if (needsSecondaryJudge({ judgment: primaryResult, prefilterDecision: prefilter.decision })) {
    secondaryResult = await judgeSourceSignalSemantics({
      rawText: signal.raw_text,
      sourcePlatform: signal.source_platform,
      apiKey: config.apiKey,
      model: config.secondaryModel,
      judgeStage: "secondary",
      timeoutMs: config.timeoutMs,
      fetchImpl,
    });
    secondary = await persistJudgment(serviceClient, signal.id, "secondary", secondaryResult);
  }

  const resolved = resolveSemanticGate({ prefilter, primary: primaryResult, secondary: secondaryResult });
  return persistSilver(serviceClient, {
    source_signal_id: signal.id,
    silver_version: COMPLAINT_SILVER_VERSION,
    semantic_version: COMPLAINT_SEMANTIC_VERSION,
    annotation_authority: "ai_silver",
    primary_judgment_id: primary.id,
    secondary_judgment_id: secondary?.id ?? null,
    prefilter_decision: prefilter.decision,
    prefilter_reason_codes: prefilter.reason_codes,
    ...resolved.semantic,
    final_decision: resolved.final_decision,
    system_certainty: resolved.system_certainty,
    resolution_reason_codes: [...new Set([...prefilter.reason_codes, ...resolved.resolution_reason_codes])],
  });
}

export async function getSilverAnnotation(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_silver_annotations")
    .select("*")
    .eq("source_signal_id", signalId)
    .eq("silver_version", COMPLAINT_SILVER_VERSION)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getSilverStats(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_silver_annotations")
    .select("final_decision, system_certainty")
    .eq("silver_version", COMPLAINT_SILVER_VERSION)
    .limit(5000);
  if (error) throw error;
  const rows = data ?? [];
  return {
    total: rows.length,
    pass: rows.filter((row) => row.final_decision === "pass").length,
    review: rows.filter((row) => row.final_decision === "review").length,
    reject: rows.filter((row) => row.final_decision === "reject").length,
    low_certainty: rows.filter((row) => row.system_certainty === "low").length,
  };
}

async function persistJudgment(serviceClient, signalId, judgeStage, result) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_semantic_judgments")
    .insert({
      source_signal_id: signalId,
      semantic_version: COMPLAINT_SEMANTIC_VERSION,
      judge_stage: judgeStage,
      problem_claim: result.problem_claim,
      experience_actor: result.experience_actor,
      friction_specificity: result.friction_specificity,
      content_kind: result.content_kind,
      evidence_quote: result.evidence_quote,
      prompt_version: result.promptVersion,
      provider: result.provider,
      model_name: result.model,
      provider_request_id: result.providerRequestId,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function persistSilver(serviceClient, row) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_silver_annotations")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
