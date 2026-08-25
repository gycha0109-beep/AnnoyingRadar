import {
  DISCOVERY_MIN_EXPLOITATION_SCORE,
  getDiscoveryExploitationWindow,
  scoreDiscoveryRunMetrics,
} from "./discovery-query-plan.mjs";
import {
  COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
  getCombinedReviewPromotionCalibration,
} from "./combined-review-promotion-calibration.mjs";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function buildNonApplicableCalibration({ family, telemetryScope }) {
  return {
    scope: "not_applicable_non_exact",
    family: family ?? null,
    telemetry_scope: telemetryScope ?? null,
    sampled: 0,
    candidate: 0,
    reject: 0,
    unresolved: 0,
    raw_promotion_rate: null,
    calibrated_promotion_rate: null,
    empirical_weight: 0,
  };
}

export function scoreDiscoveryRunMetricsWithCombinedPromotionShadow(metrics, { family } = {}) {
  const base = scoreDiscoveryRunMetrics(metrics);
  const reviewRate = Number(base.rates?.review_rate ?? 0);
  const exactNewSourceTelemetry = base.telemetry_scope === "new_source_exact";
  const calibration = exactNewSourceTelemetry
    ? getCombinedReviewPromotionCalibration({ family })
    : buildNonApplicableCalibration({ family, telemetryScope: base.telemetry_scope });

  if (!exactNewSourceTelemetry) {
    return {
      version: COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
      family: family ?? null,
      promotion_applicable: false,
      base_score: base.score,
      shadow_score: base.score,
      score_delta: 0,
      base_review_credit: reviewRate * 0.1,
      promotion_review_credit: null,
      calibration,
      base,
    };
  }

  if (base.exploration || reviewRate <= 0) {
    return {
      version: COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
      family: family ?? null,
      promotion_applicable: true,
      base_score: base.score,
      shadow_score: base.score,
      score_delta: 0,
      base_review_credit: reviewRate * 0.1,
      promotion_review_credit: reviewRate * 0.4 * calibration.calibrated_promotion_rate,
      calibration,
      base,
    };
  }

  const baseReviewCredit = 0.1 * reviewRate;
  const promotionReviewCredit = 0.4 * reviewRate * calibration.calibrated_promotion_rate;
  const shadowScore = clamp(base.score - baseReviewCredit + promotionReviewCredit);

  return {
    version: COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
    family: family ?? null,
    promotion_applicable: true,
    base_score: base.score,
    shadow_score: shadowScore,
    score_delta: shadowScore - base.score,
    base_review_credit: baseReviewCredit,
    promotion_review_credit: promotionReviewCredit,
    calibration,
    base,
  };
}

export function buildCombinedPromotionShadowRanking(plan, historicalMetrics = []) {
  const byKey = new Map(historicalMetrics.map((row) => [row.query_key, row]));
  return [...plan]
    .map((item) => {
      const metrics = byKey.get(item.query_key) ?? { completed_runs: 0 };
      const shadow = scoreDiscoveryRunMetricsWithCombinedPromotionShadow(metrics, {
        family: item.family,
      });
      const baseItem = {
        ...item,
        historical_metrics: metrics,
        yield: shadow.base,
      };
      const shadowItem = {
        ...baseItem,
        yield: { ...shadow.base, score: shadow.shadow_score },
      };
      const baseWindow = getDiscoveryExploitationWindow(baseItem);
      const shadowWindow = getDiscoveryExploitationWindow(shadowItem);
      return {
        query_key: item.query_key,
        domain: item.domain,
        family: item.family,
        telemetry_scope: shadow.base.telemetry_scope,
        promotion_applicable: shadow.promotion_applicable,
        completed_runs: Number(metrics.completed_runs ?? 0),
        exact_runs: Number(metrics.new_telemetry_runs ?? 0),
        exact_new_sources: Number(metrics.new_telemetry_inserted_count ?? 0),
        review_count: Number(
          metrics.new_admission_review_count ?? metrics.admission_review_count ?? 0,
        ),
        base_score: shadow.base_score,
        shadow_score: shadow.shadow_score,
        score_delta: shadow.score_delta,
        base_exploitation_eligible: baseWindow.eligible,
        shadow_exploitation_eligible: shadowWindow.eligible,
        base_exploitation_reason: baseWindow.reason,
        shadow_exploitation_reason: shadowWindow.reason,
        calibration: shadow.calibration,
      };
    })
    .sort((left, right) => {
      if (right.shadow_score !== left.shadow_score) return right.shadow_score - left.shadow_score;
      return left.query_key.localeCompare(right.query_key);
    });
}

export function summarizeCombinedPromotionShadow(ranking) {
  const measured = ranking.filter((row) => row.completed_runs > 0);
  const applicable = measured.filter((row) => row.promotion_applicable);
  const crossings = applicable.filter(
    (row) => row.base_exploitation_eligible !== row.shadow_exploitation_eligible,
  );
  const byFamily = {};

  for (const row of measured) {
    const key = row.family ?? "unknown";
    const current = byFamily[key] ?? {
      queries: 0,
      exact_queries: 0,
      promotion_applicable_queries: 0,
      base_score_sum: 0,
      shadow_score_sum: 0,
      delta_sum: 0,
      base_exploitation_eligible: 0,
      shadow_exploitation_eligible: 0,
    };
    current.queries += 1;
    if (row.exact_runs > 0) current.exact_queries += 1;
    if (row.promotion_applicable) current.promotion_applicable_queries += 1;
    current.base_score_sum += row.base_score;
    current.shadow_score_sum += row.shadow_score;
    current.delta_sum += row.score_delta;
    if (row.base_exploitation_eligible) current.base_exploitation_eligible += 1;
    if (row.shadow_exploitation_eligible) current.shadow_exploitation_eligible += 1;
    byFamily[key] = current;
  }

  for (const value of Object.values(byFamily)) {
    value.mean_base_score = value.queries > 0 ? value.base_score_sum / value.queries : 0;
    value.mean_shadow_score = value.queries > 0 ? value.shadow_score_sum / value.queries : 0;
    value.mean_delta = value.queries > 0 ? value.delta_sum / value.queries : 0;
    delete value.base_score_sum;
    delete value.shadow_score_sum;
    delete value.delta_sum;
  }

  return {
    version: COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
    exploitation_threshold: DISCOVERY_MIN_EXPLOITATION_SCORE,
    total_queries: ranking.length,
    measured_queries: measured.length,
    exact_measured_queries: measured.filter((row) => row.exact_runs > 0).length,
    promotion_applicable_queries: applicable.length,
    base_exploitation_eligible: measured.filter((row) => row.base_exploitation_eligible).length,
    shadow_exploitation_eligible: measured.filter((row) => row.shadow_exploitation_eligible).length,
    threshold_crossings: crossings.length,
    crossed_up: crossings.filter((row) => row.shadow_exploitation_eligible).map((row) => row.query_key),
    crossed_down: crossings.filter((row) => !row.shadow_exploitation_eligible).map((row) => row.query_key),
    exact_authority_totals: {
      exact_runs: measured.reduce((sum, row) => sum + row.exact_runs, 0),
      exact_new_sources: measured.reduce((sum, row) => sum + row.exact_new_sources, 0),
      exact_new_reviews: measured.reduce((sum, row) => sum + (
        row.promotion_applicable ? row.review_count : 0
      ), 0),
    },
    by_family: byFamily,
  };
}
