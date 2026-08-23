import { createHash } from "node:crypto";

import { GOLD_ACQUISITION_CAMPAIGN_VERSION } from "./gold-campaign.mjs";
import { HUMAN_EVALUATION_VERSION, normalizeHumanEvaluationInput } from "./semantic-contracts.mjs";

export const REPRESENTATIVE_TARGET = 60;
export const CHALLENGE_TARGET = 60;
export const EVALUATION_TARGET = 120;
export const CHALLENGE_BUCKET_TARGETS = Object.freeze({
  complaint_heavy: 15,
  domain_friction: 20,
  domain_neutral: 10,
  noise: 15,
});

export class BlindEvaluationError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "BlindEvaluationError";
    this.code = code;
    this.status = status;
  }
}

export async function initializeBlindEvaluationSet(serviceClient, { curatorUserId }) {
  const existing = await getBlindEvaluationProgress(serviceClient);
  if (existing.initialized) return existing;

  const pool = await loadCampaignPool(serviceClient);
  if (pool.signalIds.length < EVALUATION_TARGET) {
    throw new BlindEvaluationError("evaluation_pool_too_small", `Blind evaluation needs at least ${EVALUATION_TARGET} campaign signals`, { status: 409 });
  }

  const selected = new Set();
  const samples = [];
  const representative = [...pool.signalIds]
    .sort((a, b) => sampleHash(`representative:${a}`).localeCompare(sampleHash(`representative:${b}`)))
    .slice(0, REPRESENTATIVE_TARGET);

  for (const id of representative) {
    selected.add(id);
    samples.push({ source_signal_id: id, cohort: "representative", acquisition_bucket: null, sample_rank: samples.length + 1 });
  }

  for (const [bucket, target] of Object.entries(CHALLENGE_BUCKET_TARGETS)) {
    const candidates = pool.signalIds
      .filter((id) => !selected.has(id) && pool.signalBuckets.get(id)?.has(bucket))
      .sort((a, b) => sampleHash(`challenge:${bucket}:${a}`).localeCompare(sampleHash(`challenge:${bucket}:${b}`)))
      .slice(0, target);
    if (candidates.length !== target) {
      throw new BlindEvaluationError("evaluation_bucket_too_small", `Challenge bucket ${bucket} needs ${target}; found ${candidates.length}`, { status: 409 });
    }
    for (const id of candidates) {
      selected.add(id);
      samples.push({ source_signal_id: id, cohort: "challenge", acquisition_bucket: bucket, sample_rank: samples.length + 1 });
    }
  }

  const { error } = await serviceClient.rpc("ar_create_source_signal_evaluation_set", {
    p_evaluation_version: HUMAN_EVALUATION_VERSION,
    p_created_by: curatorUserId,
    p_samples: samples,
  });
  if (error) throw error;
  return getBlindEvaluationProgress(serviceClient);
}

export async function getBlindEvaluationProgress(serviceClient) {
  const { data: evalSet, error: setError } = await serviceClient
    .from("ar_source_signal_evaluation_sets")
    .select("evaluation_version, status, representative_target, challenge_target, created_at, locked_at")
    .eq("evaluation_version", HUMAN_EVALUATION_VERSION)
    .maybeSingle();
  if (setError) throw setError;
  if (!evalSet) {
    return { initialized: false, evaluation_version: HUMAN_EVALUATION_VERSION, status: "not_initialized", sample_count: 0, labeled: 0, remaining: EVALUATION_TARGET, representative: 0, challenge: 0, target: EVALUATION_TARGET };
  }

  const [{ data: samples, error: sampleError }, { data: labels, error: labelError }] = await Promise.all([
    serviceClient.from("ar_source_signal_evaluation_samples").select("source_signal_id, cohort, acquisition_bucket, sample_rank").eq("evaluation_version", HUMAN_EVALUATION_VERSION).order("sample_rank", { ascending: true }).limit(EVALUATION_TARGET),
    serviceClient.from("ar_source_signal_human_evaluations").select("source_signal_id").eq("evaluation_version", HUMAN_EVALUATION_VERSION).limit(EVALUATION_TARGET),
  ]);
  if (sampleError) throw sampleError;
  if (labelError) throw labelError;
  const rows = samples ?? [];
  const labeled = labels?.length ?? 0;
  return {
    initialized: true,
    evaluation_version: HUMAN_EVALUATION_VERSION,
    status: evalSet.status,
    sample_count: rows.length,
    labeled,
    remaining: Math.max(0, rows.length - labeled),
    representative: rows.filter((row) => row.cohort === "representative").length,
    challenge: rows.filter((row) => row.cohort === "challenge").length,
    target: EVALUATION_TARGET,
    locked_at: evalSet.locked_at,
  };
}

export async function getNextBlindEvaluation(serviceClient) {
  const progress = await getBlindEvaluationProgress(serviceClient);
  if (!progress.initialized || progress.status === "locked") return { progress, sample: null };
  const [{ data: samples, error: sampleError }, { data: labels, error: labelError }] = await Promise.all([
    serviceClient.from("ar_source_signal_evaluation_samples").select("source_signal_id, cohort, acquisition_bucket, sample_rank").eq("evaluation_version", HUMAN_EVALUATION_VERSION).order("sample_rank", { ascending: true }).limit(EVALUATION_TARGET),
    serviceClient.from("ar_source_signal_human_evaluations").select("source_signal_id").eq("evaluation_version", HUMAN_EVALUATION_VERSION).limit(EVALUATION_TARGET),
  ]);
  if (sampleError) throw sampleError;
  if (labelError) throw labelError;
  const labeledIds = new Set((labels ?? []).map((row) => row.source_signal_id));
  const next = (samples ?? []).find((row) => !labeledIds.has(row.source_signal_id));
  if (!next) return { progress, sample: null };
  const { data: signal, error: signalError } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, author_handle, raw_text, content_scope, acquisition_method")
    .eq("id", next.source_signal_id)
    .single();
  if (signalError) throw signalError;
  return { progress, sample: { ...next, signal } };
}

export async function saveBlindHumanEvaluation(serviceClient, { signalId, curatorUserId, input }) {
  const { data: sample, error: sampleError } = await serviceClient
    .from("ar_source_signal_evaluation_samples")
    .select("source_signal_id")
    .eq("evaluation_version", HUMAN_EVALUATION_VERSION)
    .eq("source_signal_id", signalId)
    .maybeSingle();
  if (sampleError) throw sampleError;
  if (!sample) throw new BlindEvaluationError("signal_not_in_blind_evaluation", "Source Signal is not part of the blind evaluation set", { status: 404 });

  const { data: evalSet, error: setError } = await serviceClient.from("ar_source_signal_evaluation_sets").select("status").eq("evaluation_version", HUMAN_EVALUATION_VERSION).single();
  if (setError) throw setError;
  if (evalSet.status !== "labeling") throw new BlindEvaluationError("blind_evaluation_locked", "Blind evaluation is already locked", { status: 409 });

  const { data: signal, error: signalError } = await serviceClient.from("ar_source_signals").select("raw_text").eq("id", signalId).single();
  if (signalError) throw signalError;
  const normalized = normalizeHumanEvaluationInput(input, signal.raw_text);
  const reviewedAt = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("ar_source_signal_human_evaluations")
    .upsert({
      evaluation_version: HUMAN_EVALUATION_VERSION,
      source_signal_id: signalId,
      annotation_authority: "human_blind",
      ...normalized,
      reviewed_by: curatorUserId,
      reviewed_at: reviewedAt,
    }, { onConflict: "evaluation_version,source_signal_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function lockBlindEvaluationSet(serviceClient, { curatorUserId }) {
  const { error } = await serviceClient.rpc("ar_lock_source_signal_evaluation_set", {
    p_evaluation_version: HUMAN_EVALUATION_VERSION,
    p_locked_by: curatorUserId,
  });
  if (error) throw error;
  return getBlindEvaluationProgress(serviceClient);
}

export async function getEvaluationSampleIds(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_evaluation_samples")
    .select("source_signal_id")
    .eq("evaluation_version", HUMAN_EVALUATION_VERSION)
    .limit(EVALUATION_TARGET);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.source_signal_id));
}

export async function loadCampaignPool(serviceClient) {
  const { data: runs, error: runError } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("id, request_metadata")
    .eq("source_platform", "naver_blog")
    .eq("status", "completed")
    .contains("request_metadata", { campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION })
    .limit(1000);
  if (runError) throw runError;
  const runRows = runs ?? [];
  const runBucket = new Map(runRows.map((row) => [row.id, row.request_metadata?.campaign_bucket ?? null]));
  if (!runRows.length) return { signalIds: [], signalBuckets: new Map() };
  const { data: observations, error: observationError } = await serviceClient
    .from("ar_source_signal_observations")
    .select("source_signal_id, ingestion_run_id")
    .in("ingestion_run_id", runRows.map((row) => row.id))
    .limit(10000);
  if (observationError) throw observationError;
  const signalBuckets = new Map();
  for (const row of observations ?? []) {
    if (!signalBuckets.has(row.source_signal_id)) signalBuckets.set(row.source_signal_id, new Set());
    const bucket = runBucket.get(row.ingestion_run_id);
    if (bucket) signalBuckets.get(row.source_signal_id).add(bucket);
  }
  return { signalIds: [...signalBuckets.keys()], signalBuckets };
}

function sampleHash(value) {
  return createHash("sha256").update(`${HUMAN_EVALUATION_VERSION}:${value}`).digest("hex");
}
