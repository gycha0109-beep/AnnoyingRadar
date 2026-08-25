import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION,
  COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE,
  COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
  COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
  getCombinedGlobalReviewPromotionRate,
  getCombinedReviewPromotionCalibration,
} from "../lib/sources/combined-review-promotion-calibration.mjs";
import {
  scoreDiscoveryRunMetricsWithCombinedPromotionShadow,
} from "../lib/sources/discovery-combined-promotion-shadow.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function exactMetrics({ inserted = 100, review = 20, reject = 80 } = {}) {
  return {
    completed_runs: 1,
    fetched_count: inserted,
    inserted_count: inserted,
    duplicate_count: 0,
    discovery_continue_count: inserted,
    discovery_reject_count: 0,
    admission_candidate_count: 0,
    admission_review_count: review,
    admission_reject_count: reject,
    new_telemetry_runs: 1,
    new_telemetry_fetched_count: inserted,
    new_telemetry_continue_count: inserted,
    new_telemetry_discovery_reject_count: 0,
    new_telemetry_inserted_count: inserted,
    new_telemetry_duplicate_count: 0,
    new_admission_candidate_count: 0,
    new_admission_review_count: review,
    new_admission_reject_count: reject,
  };
}

test("15.8I versions combined evidence without changing the shrinkage method", () => {
  assert.equal(COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION, "review-promotion-calibration-v0.2-combined");
  assert.equal(COMBINED_REVIEW_PROMOTION_SHADOW_VERSION, "review-promotion-shadow-v0.2-combined");
  assert.equal(COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH, 24);

  assert.deepEqual(COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.global, {
    sampled: 72,
    candidate: 11,
    reject: 48,
    unresolved: 13,
  });
  assert.deepEqual(COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.by_family.damage, {
    sampled: 53,
    candidate: 6,
    reject: 37,
    unresolved: 10,
  });
  assert.deepEqual(COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.by_family.delay, {
    sampled: 19,
    candidate: 5,
    reject: 11,
    unresolved: 3,
  });
  assert.equal(
    COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE.provenance.reliability_reruns_are_replacement_labels,
    false,
  );
});

test("combined conservative rates and fixed-prior family shrinkage are deterministic", () => {
  assert.equal(getCombinedGlobalReviewPromotionRate(), 11 / 72);

  const damage = getCombinedReviewPromotionCalibration({ family: "damage" });
  const delay = getCombinedReviewPromotionCalibration({ family: "delay" });
  const unseen = getCombinedReviewPromotionCalibration({ family: "contact" });

  assert.ok(Math.abs(damage.raw_promotion_rate - 6 / 53) < 1e-12);
  assert.ok(Math.abs(damage.calibrated_promotion_rate - 0.12554112554112556) < 1e-12);
  assert.ok(Math.abs(delay.raw_promotion_rate - 5 / 19) < 1e-12);
  assert.ok(Math.abs(delay.calibrated_promotion_rate - 0.20155038759689925) < 1e-12);
  assert.equal(unseen.calibrated_promotion_rate, 11 / 72);
});

test("combined promotion shadow remains exact-new-only and leaves legacy telemetry byte-equivalent", () => {
  const exact = scoreDiscoveryRunMetricsWithCombinedPromotionShadow(exactMetrics(), { family: "damage" });
  assert.equal(exact.promotion_applicable, true);
  assert.equal(exact.version, COMBINED_REVIEW_PROMOTION_SHADOW_VERSION);

  const legacy = scoreDiscoveryRunMetricsWithCombinedPromotionShadow({
    completed_runs: 1,
    fetched_count: 100,
    inserted_count: 20,
    duplicate_count: 80,
    discovery_continue_count: 20,
    discovery_reject_count: 80,
    admission_candidate_count: 0,
    admission_review_count: 10,
    admission_reject_count: 10,
  }, { family: "damage" });

  assert.equal(legacy.promotion_applicable, false);
  assert.equal(legacy.shadow_score, legacy.base_score);
  assert.equal(legacy.score_delta, 0);
  assert.equal(legacy.calibration.calibrated_promotion_rate, null);
});

test("15.8I is shadow-only and cannot become active allocation by import", async () => {
  const [activePlan, oldShadow, combinedShadow, runner] = await Promise.all([
    read("lib/sources/discovery-query-plan.mjs"),
    read("lib/sources/discovery-promotion-shadow.mjs"),
    read("lib/sources/discovery-combined-promotion-shadow.mjs"),
    read("scripts/run-discovery-combined-promotion-shadow.mjs"),
  ]);

  assert.match(activePlan, /source-discovery-allocation-v0\.4/);
  assert.doesNotMatch(activePlan, /combined-review-promotion-calibration/);
  assert.doesNotMatch(oldShadow, /combined-review-promotion-calibration/);
  assert.match(combinedShadow, /combined-review-promotion-calibration/);
  assert.match(runner, /active_allocation_version: "source-discovery-allocation-v0\.4"/);
  assert.match(runner, /active_allocation_mutated: false/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /semantic_provider_calls: 0/);
  assert.match(runner, /formation_mutations: 0/);
});

test("15.8I runner fails closed if frozen exact telemetry drifts", async () => {
  const runner = await read("scripts/run-discovery-combined-promotion-shadow.mjs");
  assert.match(runner, /EXPECTED_EXACT_RUNS = 24/);
  assert.match(runner, /EXPECTED_EXACT_NEW_SOURCES = 961/);
  assert.match(runner, /EXPECTED_EXACT_NEW_REVIEWS = 166/);
  assert.match(runner, /EXPECTED_QUERY_PLAN_SIZE = 192/);
  assert.match(runner, /phase15_8i_exact_authority_drift/);
  assert.match(runner, /reliability_reruns_used_as_replacement_labels: false/);
});
