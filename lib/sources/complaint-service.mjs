import { createHash, randomUUID } from "node:crypto";

import {
  COMPLAINT_CLASSIFIER_VERSION,
  COMPLAINT_GOLD_SET_VERSION,
  COMPLAINT_PREFILTER_VERSION,
  normalizeGoldAnnotationInput,
  runDeterministicComplaintPrefilter,
} from "./complaint-contracts.mjs";
import {
  classifyComplaintSignal,
  getComplaintProviderConfig,
} from "./complaint-classifier.mjs";
import { getHoldoutSignalIds } from "./gold-campaign.mjs";

const GOLD_REVIEW_CANDIDATE_LIMIT = 1000;
const REVIEW_LOOKUP_CHUNK_SIZE = 200;
const SOURCE_SIGNAL_REVIEW_FIELDS = "id, source_platform, external_content_id, canonical_url, author_handle, raw_text, media_type, published_at, content_hash, adapter_version, is_quote_post, acquisition_method, content_scope, source_metadata, first_seen_at, last_seen_at";

export class SourceComplaintGateError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "SourceComplaintGateError";
    this.code = code;
    this.status = status;
  }
}

export async function getSourceSignal(serviceClient, signalId) {
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select(SOURCE_SIGNAL_REVIEW_FIELDS)
    .eq("id", signalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new SourceComplaintGateError("source_signal_not_found", "Source Signal not found", { status: 404 });
  }
  return data;
}

export async function classifySourceSignal(serviceClient, {
  signalId,
  curatorUserId,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const signal = await getSourceSignal(serviceClient, signalId);
  const prefilter = runDeterministicComplaintPrefilter(signal);

  if (prefilter.decision === "reject") {
    return persistClassification(serviceClient, {
      source_signal_id: signal.id,
      classifier_version: COMPLAINT_CLASSIFIER_VERSION,
      prefilter_version: COMPLAINT_PREFILTER_VERSION,
      prefilter_decision: prefilter.decision,
      prefilter_reason_codes: prefilter.reason_codes,
      model_decision: null,
      final_decision: "reject",
      complaint_relevant: "no",
      first_hand_experience: "uncertain",
      concrete_friction: "uncertain",
      core_evidence: null,
      reason_codes: prefilter.reason_codes,
      confidence: null,
      prompt_version: null,
      provider: null,
      model_name: null,
      provider_request_id: null,
      input_tokens: null,
      output_tokens: null,
      classified_by_user_id: curatorUserId,
    });
  }

  const config = getComplaintProviderConfig(env);
  const modelResult = await classifyComplaintSignal({
    rawText: signal.raw_text,
    sourcePlatform: signal.source_platform,
    requestId: randomUUID(),
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    fetchImpl,
  });

  const finalDecision = prefilter.decision === "review"
    ? "review"
    : modelResult.decision;
  const combinedReasons = [...new Set([
    ...prefilter.reason_codes,
    ...modelResult.reason_codes,
  ])];

  return persistClassification(serviceClient, {
    source_signal_id: signal.id,
    classifier_version: COMPLAINT_CLASSIFIER_VERSION,
    prefilter_version: COMPLAINT_PREFILTER_VERSION,
    prefilter_decision: prefilter.decision,
    prefilter_reason_codes: prefilter.reason_codes,
    model_decision: modelResult.decision,
    final_decision: finalDecision,
    complaint_relevant: modelResult.complaint_relevant,
    first_hand_experience: modelResult.first_hand_experience,
    concrete_friction: modelResult.concrete_friction,
    core_evidence: modelResult.core_evidence,
    reason_codes: combinedReasons,
    confidence: modelResult.confidence,
    prompt_version: modelResult.promptVersion,
    provider: modelResult.provider,
    model_name: modelResult.model,
    provider_request_id: modelResult.providerRequestId,
    input_tokens: modelResult.usage.inputTokens,
    output_tokens: modelResult.usage.outputTokens,
    classified_by_user_id: curatorUserId,
  });
}

export async function saveGoldAnnotation(serviceClient, {
  signalId,
  curatorUserId,
  input,
}) {
  const signal = await getSourceSignal(serviceClient, signalId);
  const normalized = normalizeGoldAnnotationInput(input, signal.raw_text);
  const reviewedAt = new Date().toISOString();

  const { data, error } = await serviceClient
    .from("ar_source_signal_gold_annotations")
    .upsert({
      source_signal_id: signal.id,
      gold_set_version: COMPLAINT_GOLD_SET_VERSION,
      ...normalized,
      reviewed_by: curatorUserId,
      reviewed_at: reviewedAt,
    }, { onConflict: "source_signal_id,gold_set_version" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listSourceSignalReviewQueue(serviceClient, { limit = 30 } = {}) {
  const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const [{ data: signals, error: signalError }, holdoutSignalIds] = await Promise.all([
    serviceClient
      .from("ar_source_signals")
      .select(SOURCE_SIGNAL_REVIEW_FIELDS)
      .order("last_seen_at", { ascending: false })
      .limit(GOLD_REVIEW_CANDIDATE_LIMIT),
    getHoldoutSignalIds(serviceClient),
  ]);
  if (signalError) throw signalError;

  const rows = (signals ?? []).filter((signal) => !holdoutSignalIds.has(signal.id));
  const ids = rows.map((signal) => signal.id);
  if (ids.length === 0) return [];

  const [classifications, gold] = await Promise.all([
    fetchClassificationsBySignalIds(serviceClient, ids),
    fetchGoldBySignalIds(serviceClient, ids),
  ]);

  const latestClassification = new Map();
  for (const classification of classifications) {
    if (!latestClassification.has(classification.source_signal_id)) {
      latestClassification.set(classification.source_signal_id, classification);
    }
  }
  const goldBySignal = new Map(gold.map((annotation) => [annotation.source_signal_id, annotation]));

  const queue = rows.map((signal) => ({
    ...signal,
    classification: latestClassification.get(signal.id) ?? null,
    gold_annotation: goldBySignal.get(signal.id) ?? null,
  }));
  queue.sort((left, right) => {
    const annotationOrder = Number(Boolean(left.gold_annotation)) - Number(Boolean(right.gold_annotation));
    if (annotationOrder !== 0) return annotationOrder;
    return reviewOrderHash(left.id).localeCompare(reviewOrderHash(right.id));
  });
  return queue.slice(0, boundedLimit);
}

export async function getComplaintGoldStats(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_gold_annotations")
    .select("complaint_relevant")
    .eq("gold_set_version", COMPLAINT_GOLD_SET_VERSION);
  if (error) throw error;

  const stats = { total: 0, yes: 0, no: 0, uncertain: 0 };
  for (const row of data ?? []) {
    stats.total += 1;
    if (row.complaint_relevant in stats) stats[row.complaint_relevant] += 1;
  }
  return stats;
}

async function fetchClassificationsBySignalIds(serviceClient, ids) {
  const rows = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await serviceClient
      .from("ar_source_signal_classifications")
      .select("*")
      .in("source_signal_id", chunk)
      .order("created_at", { ascending: false })
      .limit(4000);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  rows.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  return rows;
}

async function fetchGoldBySignalIds(serviceClient, ids) {
  const rows = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await serviceClient
      .from("ar_source_signal_gold_annotations")
      .select("*")
      .in("source_signal_id", chunk)
      .eq("gold_set_version", COMPLAINT_GOLD_SET_VERSION);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function chunkIds(ids) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += REVIEW_LOOKUP_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + REVIEW_LOOKUP_CHUNK_SIZE));
  }
  return chunks;
}

function reviewOrderHash(signalId) {
  return createHash("sha256")
    .update(`gold-review-v0.1:${signalId}`)
    .digest("hex");
}

async function persistClassification(serviceClient, row) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_classifications")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
