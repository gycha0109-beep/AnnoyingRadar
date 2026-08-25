import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoveryQueryPlan,
  scoreDiscoveryRunMetrics,
  selectDiscoveryRequestBudget,
  DISCOVERY_QUERY_ALLOCATION_VERSION,
  DISCOVERY_MIN_EXPLOITATION_SCORE,
} from "../lib/sources/discovery-query-plan.mjs";

const pilotMetrics = [
  ["account__contact__1", 2, 2, 0, 2, 0, 0, 1, 1],
  ["billing__contact__1", 0, 0, 0, 0, 0, 0, 0, 0],
  ["commerce__contact__1", 0, 0, 0, 0, 0, 0, 0, 0],
  ["delivery__contact__1", 3, 3, 0, 3, 0, 0, 1, 2],
  ["healthcare__contact__1", 0, 0, 0, 0, 0, 0, 0, 0],
  ["housing__contact__1", 2, 2, 0, 2, 0, 0, 0, 2],
  ["lodging__contact__1", 2, 2, 0, 2, 0, 0, 1, 1],
  ["mobility__contact__1", 0, 0, 0, 0, 0, 0, 0, 0],
  ["refund__contact__1", 13, 13, 0, 13, 0, 1, 3, 9],
  ["repair__contact__1", 50, 50, 0, 50, 0, 0, 1, 49],
  ["reservation__contact__1", 28, 27, 1, 24, 3, 0, 6, 21],
  ["support__contact__1", 50, 45, 5, 41, 4, 0, 9, 36],
].map(([
  query_key,
  fetched_count,
  discovery_continue_count,
  discovery_reject_count,
  inserted_count,
  duplicate_count,
  admission_candidate_count,
  admission_review_count,
  admission_reject_count,
]) => ({
  query_key,
  completed_runs: 1,
  fetched_count,
  discovery_continue_count,
  discovery_reject_count,
  inserted_count,
  duplicate_count,
  admission_candidate_count,
  admission_review_count,
  admission_reject_count,
}));

test("Phase 15.8B allocation is explicitly versioned in request provenance", () => {
  assert.equal(DISCOVERY_QUERY_ALLOCATION_VERSION, "source-discovery-allocation-v0.2");
  assert.ok(buildDiscoveryQueryPlan().every(
    (item) => item.input.request_metadata.discovery_allocation_version
      === DISCOVERY_QUERY_ALLOCATION_VERSION,
  ));
});

test("a measured zero-result query is not treated as unexplored forever", () => {
  const score = scoreDiscoveryRunMetrics({ completed_runs: 1, fetched_count: 0 });
  assert.equal(score.exploration, false);
  assert.equal(score.score, 0);
});

test("pilot telemetry ranks candidate-bearing refund above reject-heavy repair", () => {
  const refund = scoreDiscoveryRunMetrics(pilotMetrics.find((row) => row.query_key === "refund__contact__1"));
  const repair = scoreDiscoveryRunMetrics(pilotMetrics.find((row) => row.query_key === "repair__contact__1"));
  assert.ok(refund.score > repair.score);
  assert.ok(refund.score >= DISCOVERY_MIN_EXPLOITATION_SCORE);
  assert.ok(repair.score < DISCOVERY_MIN_EXPLOITATION_SCORE);
  assert.ok(repair.rates.admission_reject_rate > 0.9);
});

test("next bounded budget explores new query space instead of replaying low-yield pilot queries", () => {
  const selected = selectDiscoveryRequestBudget(buildDiscoveryQueryPlan(), pilotMetrics, { maxRequests: 12 });
  const keys = new Set(selected.map((item) => item.query_key));
  const measuredKeys = new Set(pilotMetrics.map((item) => item.query_key));
  const unmeasuredCount = selected.filter((item) => !measuredKeys.has(item.query_key)).length;

  assert.equal(selected.length, 12);
  assert.ok(keys.has("refund__contact__1"));
  assert.equal(keys.has("repair__contact__1"), false);
  assert.equal(keys.has("billing__contact__1"), false);
  assert.ok(unmeasuredCount >= 5);
});
