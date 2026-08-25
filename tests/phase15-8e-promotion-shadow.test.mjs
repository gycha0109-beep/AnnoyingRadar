import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getGlobalReviewPromotionRate,
  getReviewPromotionCalibration,
  REVIEW_PROMOTION_CALIBRATION_VERSION,
  REVIEW_PROMOTION_EMPIRICAL_BASELINE,
  REVIEW_PROMOTION_PRIOR_STRENGTH,
  REVIEW_PROMOTION_SHADOW_VERSION,
} from "../lib/sources/review-promotion-calibration.mjs";
import {
  scoreDiscoveryRunMetricsWithPromotionShadow,
  summarizePromotionShadow,
} from "../lib/sources/discovery-promotion-shadow.mjs";
import { DISCOVERY_QUERY_ALLOCATION_VERSION } from "../lib/sources/discovery-query-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const approximatelyEqual = (actual, expected, epsilon = 1e-12) => Math.abs(actual - expected) <= epsilon;

function exactMetrics({ inserted = 50, reviews = 10, rejects = 40 } = {}) {
  return {
    completed_runs: 1,
    fetched_count: 50,
    inserted_count: inserted,
    duplicate_count: 0,
    discovery_continue_count: 50,
    discovery_reject_count: 0,
    admission_candidate_count: 0,
    admission_review_count: reviews,
    admission_reject_count: rejects,
    new_telemetry_runs: 1,
    new_telemetry_fetched_count: 50,
    new_telemetry_continue_count: 50,
    new_telemetry_discovery_reject_count: 0,
    new_telemetry_inserted_count: inserted,
    new_telemetry_duplicate_count: 0,
    new_admission_candidate_count: 0,
    new_admission_review_count: reviews,
    new_admission_reject_count: rejects,
  };
}

test("15.8D bounded result is represented as aggregate-only calibration authority", () => {
  assert.equal(REVIEW_PROMOTION_CALIBRATION_VERSION, "review-promotion-calibration-v0.1");
  assert.equal(REVIEW_PROMOTION_SHADOW_VERSION, "review-promotion-shadow-v0.1");
  assert.equal(REVIEW_PROMOTION_PRIOR_STRENGTH, 24);
  assert.deepEqual(REVIEW_PROMOTION_EMPIRICAL_BASELINE.global, {
    sampled: 24,
    candidate: 4,
    reject: 15,
    unresolved: 5,
  });
  assert.equal(getGlobalReviewPromotionRate(), 4 / 24);
});

test("family promotion observations are shrunk strongly toward the global bounded rate", () => {
  const damage = getReviewPromotionCalibration({ family: "damage" });
  const delay = getReviewPromotionCalibration({ family: "delay" });
  assert.equal(damage.raw_promotion_rate, 1 / 16);
  assert.equal(delay.raw_promotion_rate, 3 / 8);
  assert.equal(damage.calibrated_promotion_rate, 5 / 40);
  assert.equal(delay.calibrated_promotion_rate, 7 / 32);
  assert.equal(damage.empirical_weight, 16 / 40);
  assert.equal(delay.empirical_weight, 8 / 32);
});

test("unobserved families fall back to global rate rather than receiving invented evidence", () => {
  const fallback = getReviewPromotionCalibration({ family: "failure" });
  assert.equal(fallback.scope, "global_fallback");
  assert.equal(fallback.sample_count, 0);
  assert.equal(fallback.calibrated_promotion_rate, 4 / 24);
});

test("promotion-aware score is shadow-only and leaves active allocation version at v0.4", () => {
  assert.equal(DISCOVERY_QUERY_ALLOCATION_VERSION, "source-discovery-allocation-v0.4");
  const damage = scoreDiscoveryRunMetricsWithPromotionShadow(exactMetrics(), { family: "damage" });
  const delay = scoreDiscoveryRunMetricsWithPromotionShadow(exactMetrics(), { family: "delay" });
  assert.equal(damage.version, REVIEW_PROMOTION_SHADOW_VERSION);
  assert.ok(damage.shadow_score < damage.base_score);
  assert.ok(delay.shadow_score < delay.base_score);
  assert.ok(delay.shadow_score > damage.shadow_score);
  assert.ok(approximatelyEqual(damage.base_review_credit, 0.02));
  assert.ok(approximatelyEqual(damage.promotion_review_credit, 0.01));
});

test("queries without Review evidence remain unchanged in shadow", () => {
  const result = scoreDiscoveryRunMetricsWithPromotionShadow(
    exactMetrics({ reviews: 0, rejects: 50 }),
    { family: "damage" },
  );
  assert.equal(result.score_delta, 0);
  assert.equal(result.shadow_score, result.base_score);
});

test("shadow summary reports threshold crossings without mutating selection", () => {
  const summary = summarizePromotionShadow([
    {
      query_key: "a",
      family: "delay",
      completed_runs: 1,
      exact_runs: 1,
      base_score: 0.33,
      shadow_score: 0.31,
      score_delta: -0.02,
      base_exploitation_eligible: true,
      shadow_exploitation_eligible: false,
    },
    {
      query_key: "b",
      family: "damage",
      completed_runs: 1,
      exact_runs: 1,
      base_score: 0.3,
      shadow_score: 0.3,
      score_delta: 0,
      base_exploitation_eligible: false,
      shadow_exploitation_eligible: false,
    },
  ]);
  assert.equal(summary.threshold_crossings, 1);
  assert.deepEqual(summary.crossed_down, ["a"]);
  assert.equal(summary.base_exploitation_eligible, 1);
  assert.equal(summary.shadow_exploitation_eligible, 0);
});

test("active discovery allocation stays isolated from the promotion shadow module", async () => {
  const active = await read("lib/sources/discovery-query-plan.mjs");
  assert.match(active, /source-discovery-allocation-v0\.4/);
  assert.doesNotMatch(active, /review-promotion-calibration|promotion-shadow/i);
});

test("Phase 15.8E runner is read-only and does not inspect Blind or source bodies", async () => {
  const runner = await read("scripts/run-discovery-promotion-shadow.mjs");
  assert.match(runner, /status: "SHADOW_ONLY"/);
  assert.match(runner, /active_allocation_mutated: false/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /full_source_body_fetches: 0/);
  assert.doesNotMatch(runner, /getEvaluationSampleIds|fetchSourceFullContext|resolveSourceAdmissionWithFullContext/);
});

test("Phase 15.8E pilot checks out authoritative main and uses a dedicated temporary ops trigger", async () => {
  const workflow = await read(".github/workflows/source-promotion-shadow-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ops\/source-promotion-shadow-pilot/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-discovery-promotion-shadow\.mjs/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|pull_request:/);
});
