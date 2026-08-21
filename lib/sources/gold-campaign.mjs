import { createHash } from "node:crypto";

import { COMPLAINT_GOLD_SET_VERSION } from "./complaint-contracts.mjs";
import { normalizeNaverBlogSearchInput } from "./naver-blog-adapter.mjs";

export const GOLD_ACQUISITION_CAMPAIGN_VERSION = "gold-v0.1-acquisition-v1";
export const GOLD_BENCHMARK_VERSION = "gold-v0.1-benchmark-v1";
export const GOLD_BENCHMARK_SIZE = 300;
export const GOLD_CALIBRATION_SIZE = 200;
export const GOLD_HOLDOUT_SIZE = 100;

const QUERY_LIMIT = 20;

const QUERY_PLAN = [
  ["complaint-01", "complaint_heavy", "general", "불편", "date"],
  ["complaint-02", "complaint_heavy", "general", "짜증", "date"],
  ["complaint-03", "complaint_heavy", "general", "귀찮", "date"],
  ["complaint-04", "complaint_heavy", "general", "답답", "date"],
  ["complaint-05", "complaint_heavy", "general", "환불 안됨", "date"],
  ["complaint-06", "complaint_heavy", "general", "예약 안됨", "date"],
  ["complaint-07", "complaint_heavy", "general", "오류 때문에", "date"],
  ["complaint-08", "complaint_heavy", "general", "헛걸음", "date"],

  ["friction-01", "domain_friction", "delivery", "배달 최소주문", "date"],
  ["friction-02", "domain_friction", "delivery", "배달 취소", "date"],
  ["friction-03", "domain_friction", "taxi", "택시 호출", "date"],
  ["friction-04", "domain_friction", "taxi", "택시 취소", "date"],
  ["friction-05", "domain_friction", "travel", "여행 예약", "date"],
  ["friction-06", "domain_friction", "travel", "숙소 환불", "date"],
  ["friction-07", "domain_friction", "banking", "은행 앱", "date"],
  ["friction-08", "domain_friction", "banking", "은행 인증", "date"],
  ["friction-09", "domain_friction", "shopping", "쇼핑 반품", "date"],
  ["friction-10", "domain_friction", "shopping", "쇼핑 배송", "date"],
  ["friction-11", "domain_friction", "jobs", "취업 사이트", "date"],
  ["friction-12", "domain_friction", "jobs", "채용 지원", "date"],
  ["friction-13", "domain_friction", "fitness", "헬스장 환불", "date"],
  ["friction-14", "domain_friction", "fitness", "헬스장 예약", "date"],
  ["friction-15", "domain_friction", "healthcare", "병원 예약", "date"],
  ["friction-16", "domain_friction", "healthcare", "병원 대기", "date"],

  ["neutral-01", "domain_neutral", "delivery", "배달", "sim"],
  ["neutral-02", "domain_neutral", "taxi", "택시", "sim"],
  ["neutral-03", "domain_neutral", "travel", "여행", "sim"],
  ["neutral-04", "domain_neutral", "banking", "은행", "sim"],
  ["neutral-05", "domain_neutral", "shopping", "쇼핑", "sim"],
  ["neutral-06", "domain_neutral", "jobs", "취업", "sim"],
  ["neutral-07", "domain_neutral", "fitness", "헬스장", "sim"],
  ["neutral-08", "domain_neutral", "healthcare", "병원", "sim"],

  ["noise-01", "noise", "general", "추천", "sim"],
  ["noise-02", "noise", "general", "할인", "sim"],
  ["noise-03", "noise", "general", "이벤트", "sim"],
  ["noise-04", "noise", "general", "광고", "sim"],
  ["noise-05", "noise", "general", "후기", "sim"],
  ["noise-06", "noise", "general", "신제품", "sim"],
  ["noise-07", "noise", "general", "뉴스", "sim"],
  ["noise-08", "noise", "general", "맛집", "sim"],
];

export class GoldCampaignError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "GoldCampaignError";
    this.code = code;
    this.status = status;
  }
}

export function buildGoldAcquisitionPlan() {
  return QUERY_PLAN.map(([queryKey, bucket, domain, q, sort], index) => {
    const input = normalizeNaverBlogSearchInput({ q, sort, limit: QUERY_LIMIT, start: 1 });
    return {
      ordinal: index + 1,
      query_key: queryKey,
      bucket,
      domain,
      input: {
        ...input,
        request_metadata: {
          ...input.request_metadata,
          campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION,
          campaign_query_key: queryKey,
          campaign_bucket: bucket,
          campaign_domain: domain,
          campaign_ordinal: index + 1,
        },
      },
    };
  });
}

export function getGoldAcquisitionPlanSummary() {
  const plan = buildGoldAcquisitionPlan();
  const buckets = {};
  const domains = {};
  for (const item of plan) {
    buckets[item.bucket] = (buckets[item.bucket] ?? 0) + 1;
    domains[item.domain] = (domains[item.domain] ?? 0) + 1;
  }
  return {
    campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION,
    query_count: plan.length,
    result_opportunity_count: plan.reduce((sum, item) => sum + item.input.limit, 0),
    buckets,
    domains,
  };
}

export async function getCompletedGoldCampaignQueryKeys(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("request_metadata")
    .eq("source_platform", "naver_blog")
    .eq("status", "completed")
    .contains("request_metadata", { campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION })
    .limit(1000);
  if (error) throw error;
  return new Set((data ?? [])
    .map((row) => row.request_metadata?.campaign_query_key)
    .filter(Boolean));
}

export async function getGoldCampaignProgress(serviceClient) {
  const plan = buildGoldAcquisitionPlan();
  const { data: runs, error } = await serviceClient
    .from("ar_source_ingestion_runs")
    .select("id, status, fetched_count, inserted_count, duplicate_count, skipped_count, request_metadata")
    .eq("source_platform", "naver_blog")
    .contains("request_metadata", { campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION })
    .limit(1000);
  if (error) throw error;

  const rows = runs ?? [];
  const completedQueryKeys = new Set(rows
    .filter((row) => row.status === "completed")
    .map((row) => row.request_metadata?.campaign_query_key)
    .filter(Boolean));
  const runIds = rows.map((row) => row.id);
  let poolSize = 0;
  if (runIds.length > 0) {
    const { data: observations, error: observationError } = await serviceClient
      .from("ar_source_signal_observations")
      .select("source_signal_id")
      .in("ingestion_run_id", runIds)
      .limit(10000);
    if (observationError) throw observationError;
    poolSize = new Set((observations ?? []).map((row) => row.source_signal_id)).size;
  }

  return {
    campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION,
    planned_queries: plan.length,
    completed_queries: completedQueryKeys.size,
    failed_runs: rows.filter((row) => row.status === "failed").length,
    fetched_total: rows.reduce((sum, row) => sum + Number(row.fetched_count ?? 0), 0),
    inserted_total: rows.reduce((sum, row) => sum + Number(row.inserted_count ?? 0), 0),
    duplicate_total: rows.reduce((sum, row) => sum + Number(row.duplicate_count ?? 0), 0),
    skipped_total: rows.reduce((sum, row) => sum + Number(row.skipped_count ?? 0), 0),
    unique_signal_pool: poolSize,
  };
}

export async function getGoldBenchmarkStats(serviceClient) {
  const [{ count: annotationCount, error: annotationError }, { data: memberships, error: membershipError }] = await Promise.all([
    serviceClient
      .from("ar_source_signal_gold_annotations")
      .select("*", { count: "exact", head: true })
      .eq("gold_set_version", COMPLAINT_GOLD_SET_VERSION),
    serviceClient
      .from("ar_source_signal_gold_benchmark_memberships")
      .select("evaluation_partition")
      .eq("benchmark_version", GOLD_BENCHMARK_VERSION)
      .limit(GOLD_BENCHMARK_SIZE),
  ]);
  if (annotationError) throw annotationError;
  if (membershipError) throw membershipError;

  const rows = memberships ?? [];
  return {
    gold_set_version: COMPLAINT_GOLD_SET_VERSION,
    benchmark_version: GOLD_BENCHMARK_VERSION,
    annotated: annotationCount ?? 0,
    target: GOLD_BENCHMARK_SIZE,
    frozen: rows.length === GOLD_BENCHMARK_SIZE,
    frozen_count: rows.length,
    calibration: rows.filter((row) => row.evaluation_partition === "calibration").length,
    holdout: rows.filter((row) => row.evaluation_partition === "holdout").length,
    calibration_target: GOLD_CALIBRATION_SIZE,
    holdout_target: GOLD_HOLDOUT_SIZE,
  };
}

export async function freezeGoldBenchmark(serviceClient, { curatorUserId }) {
  const existing = await readBenchmarkMemberships(serviceClient);
  if (existing.length > 0) {
    if (existing.length !== GOLD_BENCHMARK_SIZE) {
      throw new GoldCampaignError(
        "gold_benchmark_partial_freeze",
        `Benchmark ${GOLD_BENCHMARK_VERSION} has a partial immutable freeze (${existing.length}/${GOLD_BENCHMARK_SIZE})`,
        { status: 409 },
      );
    }
    return summarizeFrozenMemberships(existing);
  }

  const { data: annotations, error } = await serviceClient
    .from("ar_source_signal_gold_annotations")
    .select("source_signal_id, gold_set_version")
    .eq("gold_set_version", COMPLAINT_GOLD_SET_VERSION)
    .limit(5000);
  if (error) throw error;
  if ((annotations ?? []).length < GOLD_BENCHMARK_SIZE) {
    throw new GoldCampaignError(
      "gold_benchmark_insufficient_annotations",
      `Gold benchmark needs at least ${GOLD_BENCHMARK_SIZE} annotations before freeze; found ${(annotations ?? []).length}`,
      { status: 409 },
    );
  }

  const selected = [...annotations]
    .sort((left, right) => benchmarkHash(left.source_signal_id).localeCompare(benchmarkHash(right.source_signal_id)))
    .slice(0, GOLD_BENCHMARK_SIZE);

  const rows = selected.map((annotation, index) => ({
    source_signal_id: annotation.source_signal_id,
    gold_set_version: annotation.gold_set_version,
    benchmark_version: GOLD_BENCHMARK_VERSION,
    sample_rank: index + 1,
    evaluation_partition: index < GOLD_CALIBRATION_SIZE ? "calibration" : "holdout",
    assigned_by: curatorUserId,
  }));

  const { data: inserted, error: insertError } = await serviceClient
    .from("ar_source_signal_gold_benchmark_memberships")
    .insert(rows)
    .select("source_signal_id, evaluation_partition, sample_rank");
  if (insertError) throw insertError;
  return summarizeFrozenMemberships(inserted ?? []);
}

export async function getHoldoutSignalIds(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_gold_benchmark_memberships")
    .select("source_signal_id")
    .eq("benchmark_version", GOLD_BENCHMARK_VERSION)
    .eq("evaluation_partition", "holdout")
    .limit(GOLD_HOLDOUT_SIZE);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.source_signal_id));
}

async function readBenchmarkMemberships(serviceClient) {
  const { data, error } = await serviceClient
    .from("ar_source_signal_gold_benchmark_memberships")
    .select("source_signal_id, evaluation_partition, sample_rank")
    .eq("benchmark_version", GOLD_BENCHMARK_VERSION)
    .order("sample_rank", { ascending: true })
    .limit(GOLD_BENCHMARK_SIZE);
  if (error) throw error;
  return data ?? [];
}

function benchmarkHash(sourceSignalId) {
  return createHash("sha256")
    .update(`${GOLD_BENCHMARK_VERSION}:${sourceSignalId}`)
    .digest("hex");
}

function summarizeFrozenMemberships(rows) {
  return {
    benchmark_version: GOLD_BENCHMARK_VERSION,
    frozen_count: rows.length,
    calibration: rows.filter((row) => row.evaluation_partition === "calibration").length,
    holdout: rows.filter((row) => row.evaluation_partition === "holdout").length,
  };
}
