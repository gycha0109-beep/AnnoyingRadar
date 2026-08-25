export const DISCOVERY_QUERY_PLAN_VERSION = "source-discovery-plan-v0.1";
export const DISCOVERY_QUERY_ALLOCATION_VERSION = "source-discovery-allocation-v0.2";
export const DISCOVERY_MIN_EXPLOITATION_SCORE = 0.32;

const DOMAIN_SUBJECTS = Object.freeze({
  refund: ["환불", "취소 환불"],
  reservation: ["예약", "예약조회"],
  lodging: ["숙소 예약", "호텔 예약"],
  delivery: ["배달 주문", "음식 주문"],
  support: ["고객센터", "상담원"],
  repair: ["수리", "AS 수리"],
  billing: ["구독 결제", "자동 결제"],
  account: ["로그인 인증", "계정 인증"],
  mobility: ["택시 호출", "이동 서비스"],
  healthcare: ["병원 예약", "진료 예약"],
  housing: ["전세 계약", "부동산 계약"],
  commerce: ["온라인 쇼핑", "상품 배송"],
});

const QUERY_FAMILIES = Object.freeze([
  { key: "failure", suffix: "안됨" },
  { key: "delay", suffix: "지연" },
  { key: "rejection", suffix: "거절" },
  { key: "contact", suffix: "연락 안됨" },
  { key: "error", suffix: "오류" },
  { key: "damage", suffix: "피해" },
  { key: "struggle", suffix: "고생" },
  { key: "experience", suffix: "문제 후기" },
]);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function buildDiscoveryQueryPlan({
  domains = Object.keys(DOMAIN_SUBJECTS),
  limit = 50,
  sort = "date",
  start = 1,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new RangeError("limit must be 1..50");
  if (!Number.isInteger(start) || start < 1 || start + limit - 1 > 1000) throw new RangeError("invalid start/limit window");
  if (sort !== "date" && sort !== "sim") throw new TypeError("sort must be date or sim");

  const plan = [];
  for (const family of QUERY_FAMILIES) {
    for (const domain of domains) {
      const subjects = DOMAIN_SUBJECTS[domain];
      if (!subjects) throw new TypeError(`unsupported discovery domain: ${domain}`);
      for (const [subjectIndex, subject] of subjects.entries()) {
        const queryKey = `${domain}__${family.key}__${subjectIndex + 1}`;
        const q = `${subject} ${family.suffix}`;
        plan.push({
          query_key: queryKey,
          domain,
          family: family.key,
          input: {
            q,
            sort,
            start,
            limit,
            search_type: sort === "date" ? "RECENT" : "TOP",
            search_mode: "KEYWORD",
            since: null,
            until: null,
            request_metadata: {
              provider: "naver_api_hub",
              resource: "blog_search",
              sort,
              start,
              display: limit,
              discovery_campaign_version: DISCOVERY_QUERY_PLAN_VERSION,
              discovery_allocation_version: DISCOVERY_QUERY_ALLOCATION_VERSION,
              discovery_query_key: queryKey,
              discovery_domain: domain,
              discovery_family: family.key,
            },
          },
        });
      }
    }
  }
  return plan;
}

export function getDiscoveryQueryPlanSummary(options = {}) {
  const plan = buildDiscoveryQueryPlan(options);
  return {
    version: DISCOVERY_QUERY_PLAN_VERSION,
    allocation_version: DISCOVERY_QUERY_ALLOCATION_VERSION,
    query_count: plan.length,
    result_opportunity_count: plan.reduce((sum, item) => sum + item.input.limit, 0),
    domain_count: new Set(plan.map((item) => item.domain)).size,
    family_count: new Set(plan.map((item) => item.family)).size,
  };
}

export function scoreDiscoveryRunMetrics(metrics) {
  const fetched = Number(metrics?.fetched_count ?? 0);
  const accepted = Number(metrics?.discovery_continue_count ?? 0);
  const rejected = Number(metrics?.discovery_reject_count ?? 0);
  const inserted = Number(metrics?.inserted_count ?? 0);
  const duplicates = Number(metrics?.duplicate_count ?? 0);
  const candidates = Number(metrics?.admission_candidate_count ?? 0);
  const reviews = Number(metrics?.admission_review_count ?? 0);
  const admissionRejects = Number(metrics?.admission_reject_count ?? 0);
  const completedRuns = Number(metrics?.completed_runs ?? 1);

  if (completedRuns < 1) {
    return {
      score: 0.55,
      exploration: true,
      rates: {
        reject_rate: 0,
        new_signal_rate: 0,
        duplicate_rate: 0,
        candidate_rate: 0,
        review_rate: 0,
        admission_reject_rate: 0,
        result_density: 0,
      },
    };
  }

  if (fetched < 1) {
    return {
      score: 0,
      exploration: false,
      rates: {
        reject_rate: 0,
        new_signal_rate: 0,
        duplicate_rate: 0,
        candidate_rate: 0,
        review_rate: 0,
        admission_reject_rate: 0,
        result_density: 0,
      },
    };
  }

  const rejectRate = safeRate(rejected, fetched);
  const resultDensity = clamp(fetched / 10);

  if (accepted < 1) {
    return {
      score: clamp((0.05 * resultDensity) + (0.05 * (1 - rejectRate))),
      exploration: false,
      rates: {
        reject_rate: rejectRate,
        new_signal_rate: 0,
        duplicate_rate: 0,
        candidate_rate: 0,
        review_rate: 0,
        admission_reject_rate: 0,
        result_density: resultDensity,
      },
    };
  }

  const newSignalRate = safeRate(inserted, accepted);
  const duplicateRate = safeRate(duplicates, accepted);
  const candidateRate = safeRate(candidates, accepted);
  const reviewRate = safeRate(reviews, accepted);
  const admissionRejectRate = safeRate(admissionRejects, accepted);
  const score = clamp(
    (0.4 * candidateRate)
      + (0.1 * reviewRate)
      + (0.1 * newSignalRate)
      + (0.1 * resultDensity)
      + (0.2 * (1 - admissionRejectRate))
      + (0.05 * (1 - duplicateRate))
      + (0.05 * (1 - rejectRate)),
  );

  return {
    score,
    exploration: false,
    rates: {
      reject_rate: rejectRate,
      new_signal_rate: newSignalRate,
      duplicate_rate: duplicateRate,
      candidate_rate: candidateRate,
      review_rate: reviewRate,
      admission_reject_rate: admissionRejectRate,
      result_density: resultDensity,
    },
  };
}

export function rankDiscoveryQueries(plan, historicalMetrics = []) {
  const byKey = new Map(historicalMetrics.map((row) => [row.query_key, row]));
  return [...plan]
    .map((item) => ({
      ...item,
      yield: scoreDiscoveryRunMetrics(byKey.get(item.query_key) ?? { completed_runs: 0 }),
    }))
    .sort((left, right) => {
      if (left.yield.exploration !== right.yield.exploration) return left.yield.exploration ? -1 : 1;
      if (right.yield.score !== left.yield.score) return right.yield.score - left.yield.score;
      return left.query_key.localeCompare(right.query_key);
    });
}

function roundRobinByDomain(items) {
  const buckets = new Map();
  for (const item of items) {
    const bucket = buckets.get(item.domain) ?? [];
    bucket.push(item);
    buckets.set(item.domain, bucket);
  }

  const domains = [...buckets.keys()].sort();
  const result = [];
  let added = true;
  while (added) {
    added = false;
    for (const domain of domains) {
      const bucket = buckets.get(domain);
      const item = bucket?.shift();
      if (!item) continue;
      result.push(item);
      added = true;
    }
  }
  return result;
}

export function selectDiscoveryRequestBudget(plan, historicalMetrics = [], { maxRequests = 24 } = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new RangeError("maxRequests must be a positive integer");
  const ranked = rankDiscoveryQueries(plan, historicalMetrics);
  const exploration = roundRobinByDomain(ranked.filter((item) => item.yield.exploration));
  const exploitation = ranked.filter(
    (item) => !item.yield.exploration && item.yield.score >= DISCOVERY_MIN_EXPLOITATION_SCORE,
  );
  const deferredMeasured = ranked.filter(
    (item) => !item.yield.exploration && item.yield.score < DISCOVERY_MIN_EXPLOITATION_SCORE,
  );
  const explorationSlots = Math.min(exploration.length, Math.ceil(maxRequests * 0.35));
  const selected = exploration.slice(0, explorationSlots);
  const selectedKeys = new Set(selected.map((item) => item.query_key));

  for (const item of [...exploitation, ...exploration.slice(explorationSlots), ...deferredMeasured]) {
    if (selected.length >= maxRequests) break;
    if (selectedKeys.has(item.query_key)) continue;
    selected.push(item);
    selectedKeys.add(item.query_key);
  }
  return selected;
}
