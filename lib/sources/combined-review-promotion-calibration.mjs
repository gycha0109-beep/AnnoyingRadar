export const COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION = "review-promotion-calibration-v0.2-combined";
export const COMBINED_REVIEW_PROMOTION_SHADOW_VERSION = "review-promotion-shadow-v0.2-combined";

// Keep the Phase 15.8E shrinkage method fixed so Phase 15.8I changes the
// empirical evidence only, not the calibration method at the same time.
export const COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH = 24;

export const COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE = Object.freeze({
  authority: "disjoint_one_shot_conservative",
  provenance: Object.freeze({
    phases: Object.freeze(["15.8D", "15.8F"]),
    initial: Object.freeze({
      workflow_run_id: 32803527457,
      sample_version: "exact-new-review-sample-v0.1",
      sampled: 24,
    }),
    holdout: Object.freeze({
      workflow_run_id: 32807308702,
      sample_version: "exact-new-review-holdout-v0.1",
      sampled: 48,
      fingerprint: "30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7",
    }),
    reliability_reruns_are_replacement_labels: false,
  }),
  global: Object.freeze({
    sampled: 72,
    candidate: 11,
    reject: 48,
    unresolved: 13,
  }),
  by_family: Object.freeze({
    damage: Object.freeze({ sampled: 53, candidate: 6, reject: 37, unresolved: 10 }),
    delay: Object.freeze({ sampled: 19, candidate: 5, reject: 11, unresolved: 3 }),
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
    throw new TypeError("Combined Review promotion calibration counts must be integers");
  }
  if ([sampled, candidate, reject, unresolved].some((value) => value < 0)) {
    throw new RangeError("Combined Review promotion calibration counts must be nonnegative");
  }
  if (candidate + reject + unresolved !== sampled) {
    throw new RangeError("Combined Review promotion calibration outcomes must equal sampled count");
  }
  return { sampled, candidate, reject, unresolved };
}

export function getCombinedGlobalReviewPromotionRate() {
  const global = validateCounts(COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.global);
  return safeRate(global.candidate, global.sampled);
}

export function getCombinedReviewPromotionCalibration({ family } = {}) {
  const global = validateCounts(COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.global);
  const globalRate = safeRate(global.candidate, global.sampled);
  const observedBucket = family
    ? COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.by_family[family]
    : null;

  if (!observedBucket) {
    return {
      version: COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION,
      scope: "global_fallback",
      family: family ?? null,
      sample_count: 0,
      candidate_count: 0,
      reject_count: 0,
      unresolved_count: 0,
      raw_promotion_rate: null,
      calibrated_promotion_rate: globalRate,
      global_promotion_rate: globalRate,
      prior_strength: COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
      empirical_weight: 0,
    };
  }

  const observed = validateCounts(observedBucket);
  const priorCandidateMass = COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH * globalRate;
  const calibratedRate = safeRate(
    observed.candidate + priorCandidateMass,
    observed.sampled + COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
  );

  return {
    version: COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION,
    scope: "family_shrunk",
    family,
    sample_count: observed.sampled,
    candidate_count: observed.candidate,
    reject_count: observed.reject,
    unresolved_count: observed.unresolved,
    raw_promotion_rate: safeRate(observed.candidate, observed.sampled),
    calibrated_promotion_rate: calibratedRate,
    global_promotion_rate: globalRate,
    prior_strength: COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
    empirical_weight: safeRate(
      observed.sampled,
      observed.sampled + COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
    ),
  };
}
