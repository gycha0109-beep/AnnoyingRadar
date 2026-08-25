import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDiscoveryQueryPlan,
  getDiscoveryExploitationWindow,
  scoreDiscoveryRunMetrics,
  selectDiscoveryRequestBudget,
  DISCOVERY_QUERY_ALLOCATION_VERSION,
  DISCOVERY_MIN_EXPLOITATION_SCORE,
} from "../lib/sources/discovery-query-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const metric = ({
  query_key,
  completed_runs = 1,
  fetched_count,
  discovery_continue_count,
  discovery_reject_count = 0,
  inserted_count,
  duplicate_count = 0,
  admission_candidate_count = 0,
  admission_review_count = 0,
  admission_reject_count = 0,
  max_start = 1,
  max_start_fetched_count = fetched_count,
  requested_limit = 50,
}) => ({
  query_key,
  completed_runs,
  fetched_count,
  discovery_continue_count,
  discovery_reject_count,
  inserted_count,
  duplicate_count,
  admission_candidate_count,
  admission_review_count,
  admission_reject_count,
  max_start,
  max_start_fetched_count,
  requested_limit,
});

const observedMetrics = [
  metric({ query_key: "account__contact__1", completed_runs: 2, fetched_count: 4, discovery_continue_count: 4, inserted_count: 2, duplicate_count: 2, admission_review_count: 2, admission_reject_count: 2, max_start_fetched_count: 2 }),
  metric({ query_key: "billing__contact__1", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "commerce__contact__1", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "delivery__contact__1", completed_runs: 2, fetched_count: 6, discovery_continue_count: 6, inserted_count: 3, duplicate_count: 3, admission_review_count: 2, admission_reject_count: 4, max_start_fetched_count: 3 }),
  metric({ query_key: "healthcare__contact__1", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "housing__contact__1", fetched_count: 2, discovery_continue_count: 2, inserted_count: 2, admission_reject_count: 2, max_start_fetched_count: 2 }),
  metric({ query_key: "lodging__contact__1", completed_runs: 2, fetched_count: 4, discovery_continue_count: 4, inserted_count: 2, duplicate_count: 2, admission_review_count: 2, admission_reject_count: 2, max_start_fetched_count: 2 }),
  metric({ query_key: "mobility__contact__1", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "refund__contact__1", completed_runs: 2, fetched_count: 26, discovery_continue_count: 26, inserted_count: 13, duplicate_count: 13, admission_candidate_count: 2, admission_review_count: 6, admission_reject_count: 18, max_start_fetched_count: 13 }),
  metric({ query_key: "repair__contact__1", fetched_count: 50, discovery_continue_count: 50, inserted_count: 50, admission_review_count: 1, admission_reject_count: 49, max_start_fetched_count: 50 }),
  metric({ query_key: "reservation__contact__1", completed_runs: 2, fetched_count: 56, discovery_continue_count: 54, discovery_reject_count: 2, inserted_count: 24, duplicate_count: 30, admission_review_count: 12, admission_reject_count: 42, max_start_fetched_count: 28 }),
  metric({ query_key: "support__contact__1", completed_runs: 2, fetched_count: 100, discovery_continue_count: 90, discovery_reject_count: 10, inserted_count: 41, duplicate_count: 49, admission_review_count: 18, admission_reject_count: 72, max_start_fetched_count: 50 }),
  metric({ query_key: "account__contact__2", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "billing__contact__2", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "commerce__contact__2", fetched_count: 1, discovery_continue_count: 1, inserted_count: 1, admission_reject_count: 1, max_start_fetched_count: 1 }),
  metric({ query_key: "delivery__contact__2", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "healthcare__contact__2", fetched_count: 0, discovery_continue_count: 0, inserted_count: 0, max_start_fetched_count: 0 }),
  metric({ query_key: "housing__contact__2", fetched_count: 1, discovery_continue_count: 1, inserted_count: 1, admission_reject_count: 1, max_start_fetched_count: 1 }),
];

test("Phase 15.8B allocation v0.3 is explicit in request provenance", () => {
  assert.equal(DISCOVERY_QUERY_ALLOCATION_VERSION, "source-discovery-allocation-v0.3");
  assert.ok(buildDiscoveryQueryPlan().every(
    (item) => item.input.request_metadata.discovery_allocation_version
      === DISCOVERY_QUERY_ALLOCATION_VERSION,
  ));
});

test("measured empty queries stay measured rather than becoming exploration again", () => {
  const score = scoreDiscoveryRunMetrics({ completed_runs: 1, fetched_count: 0 });
  assert.equal(score.exploration, false);
  assert.equal(score.score, 0);
});

test("candidate-bearing partial first page is exhausted instead of replayed", () => {
  const planItem = buildDiscoveryQueryPlan().find((item) => item.query_key === "refund__contact__1");
  const metrics = observedMetrics.find((row) => row.query_key === "refund__contact__1");
  const item = { ...planItem, historical_metrics: metrics, yield: scoreDiscoveryRunMetrics(metrics) };
  assert.ok(item.yield.score >= DISCOVERY_MIN_EXPLOITATION_SCORE);
  assert.deepEqual(getDiscoveryExploitationWindow(item), {
    eligible: false,
    reason: "exhausted_page",
  });
});

test("reject-heavy full page remains below exploitation threshold", () => {
  const repair = scoreDiscoveryRunMetrics(observedMetrics.find((row) => row.query_key === "repair__contact__1"));
  assert.ok(repair.score < DISCOVERY_MIN_EXPLOITATION_SCORE);
  assert.ok(repair.rates.admission_reject_rate > 0.9);
});

test("a productive full page advances to the next provider window rather than replaying start=1", () => {
  const planItem = buildDiscoveryQueryPlan().find((item) => item.query_key === "refund__delay__1");
  const metrics = metric({
    query_key: "refund__delay__1",
    fetched_count: 50,
    discovery_continue_count: 45,
    discovery_reject_count: 5,
    inserted_count: 42,
    duplicate_count: 3,
    admission_candidate_count: 8,
    admission_review_count: 10,
    admission_reject_count: 27,
    max_start: 1,
    max_start_fetched_count: 50,
  });
  const item = { ...planItem, historical_metrics: metrics, yield: scoreDiscoveryRunMetrics(metrics) };
  assert.deepEqual(getDiscoveryExploitationWindow(item), {
    eligible: true,
    reason: "next_page",
    next_start: 51,
    limit: 50,
  });
});

test("next bounded budget avoids exact-page replay and preserves new-query exploration", () => {
  const productive = metric({
    query_key: "refund__delay__1",
    fetched_count: 50,
    discovery_continue_count: 45,
    discovery_reject_count: 5,
    inserted_count: 42,
    duplicate_count: 3,
    admission_candidate_count: 8,
    admission_review_count: 10,
    admission_reject_count: 27,
    max_start: 1,
    max_start_fetched_count: 50,
  });
  const historical = [...observedMetrics, productive];
  const selected = selectDiscoveryRequestBudget(buildDiscoveryQueryPlan(), historical, { maxRequests: 12 });
  const measuredKeys = new Set(historical.map((item) => item.query_key));
  const unmeasured = selected.filter((item) => !measuredKeys.has(item.query_key));
  const exploitation = selected.find((item) => item.query_key === "refund__delay__1");

  assert.equal(selected.length, 12);
  assert.equal(selected.some((item) => item.query_key === "refund__contact__1"), false);
  assert.equal(selected.some((item) => item.query_key === "repair__contact__1"), false);
  assert.equal(selected.some((item) => item.query_key === "billing__contact__1"), false);
  assert.equal(exploitation?.input.start, 51);
  assert.equal(exploitation?.input.request_metadata.discovery_page_start, 51);
  assert.equal(exploitation?.input.request_metadata.discovery_allocation_mode, "exploitation");
  assert.ok(unmeasured.length >= 11);
  assert.ok(unmeasured.every((item) => item.input.start === 1));
  assert.ok(unmeasured.every(
    (item) => item.input.request_metadata.discovery_allocation_mode === "exploration",
  ));
});

test("query metrics retain the highest observed page window needed for pagination", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /requested_limit/);
  assert.match(service, /max_start/);
  assert.match(service, /max_start_fetched_count/);
  assert.match(service, /run\.request_metadata\?\.start/);
  assert.match(service, /runStart > current\.max_start/);
});
