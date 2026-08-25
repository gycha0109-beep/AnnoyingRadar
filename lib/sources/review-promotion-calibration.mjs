export const REVIEW_PROMOTION_CALIBRATION_VERSION = "review-promotion-calibration-v0.1";
export const REVIEW_PROMOTION_SHADOW_VERSION = "review-promotion-shadow-v0.1";
export const REVIEW_PROMOTION_PRIOR_STRENGTH = 24;

export const REVIEW_PROMOTION_EMPIRICAL_BASELINE = Object.freeze({
  provenance: Object.freeze({
    phase: "15.8D",
    workflow_run_id: 32803527457,
    workflow_job_id: 97669039003,
    artifact_id: 9547401938,
    sample_version: "exact-new-review-sample-v0.1",
  }),
  global: Object.freeze({
    sampled: 24,
    candidate: 4,
    reject: 15,
    unresolved: 5,
  }),
  by_family: Object.freeze({
    damage: Object.freeze({ sampled: 16, candidate: 1, reject: 11, unresolved: 4 }),
    delay: Object.freeze({ sampled: 8, candidate: 3, reject: 4, unresolved: 1 }),
  }),
});

function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function validateCounts(bucket) {
  const sampled = Number(bucket?.sampled ?? 0);
  const candidate = Number(bucket?.candidate ?? 0);
  const reject = Number(bucket?.reject ?? 0);
  const unresolved = Number(bucket?.unresolved ?? 0);
  if (![sampled, candidate, reject, unresolved].every(Number.isInteger)) {
    throw new TypeError("Review promotion calibration counts must be integers");
  }
  if ([sampled, candidate, reject, unresolved].some((value) => value < 0)) {
    throw new RangeError("Review promotion calibration counts must be nonnegative");
  }
  if (candidate + reject + unresolved !== sampled) {
    throw new RangeError("Review promotion calibration outcomes must equal sampled count");
  }
  return { sampled, candidate, reject, unresolved };
}

export function getGlobalReviewPromotionRate() {
  const global = validateCounts(REVIEW_PROMOTION_EMPIRICAL_BASELINE.global);
  return safeRate(global.candidate, global.sampled);
}

export function getReviewPromotionCalibration({ family } = {}) {
  const global = validateCounts(REVIEW_PROMOTION_EMPIRICAL_BASELINE.global);
  const globalRate = safeRate(global.candidate, global.sampled);
  const observedBucket = family ? REVIEW_PROMOTION_EMPIRICAL_BASELINE.by_family[family] : null;

  if (!observedBucket) {
    return {
      version: REVIEW_PROMOTION_CALIBRATION_VERSION,
      scope: "global_fallback",
      family: family ?? null,
      sample_count: 0,
      candidate_count: 0,
      reject_count: 0,
      unresolved_count: 0,
      raw_promotion_rate: null,
      calibrated_promotion_rate: globalRate,
      global_promotion_rate: globalRate,
      prior_strength: REVIEW_PROMOTION_PRIOR_STRENGTH,
      empirical_weight: 0,
    };
  }

  const observed = validateCounts(observedBucket);
  const priorCandidateMass = REVIEW_PROMOTION_PRIOR_STRENGTH * globalRate;
  const calibratedRate = safeRate(
    observed.candidate + priorCandidateMass,
    observed.sampled + REVIEW_PROMOTION_PRIOR_STRENGTH,
  );

  return {
    version: REVIEW_PROMOTION_CALIBRATION_VERSION,
    scope: "family_shrunk",
    family,
    sample_count: observed.sampled,
    candidate_count: observed.candidate,
    reject_count: observed.reject,
    unresolved_count: observed.unresolved,
    raw_promotion_rate: safeRate(observed.candidate, observed.sampled),
    calibrated_promotion_rate: calibratedRate,
    global_promotion_rate: globalRate,
    prior_strength: REVIEW_PROMOTION_PRIOR_STRENGTH,
    empirical_weight: safeRate(observed.sampled, observed.sampled + REVIEW_PROMOTION_PRIOR_STRENGTH),
  };
}
