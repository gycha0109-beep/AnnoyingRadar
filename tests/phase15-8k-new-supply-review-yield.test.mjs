import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE,
  NEW_SUPPLY_REVIEW_SAMPLE_VERSION,
  selectDeterministicNewSupplyReviewSample,
} from "../lib/sources/new-supply-review-sampling.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function record(id, domain, family, queryKey = `${domain}__${family}__1`) {
  return { domain, family, query_key: queryKey, signal: { id } };
}

test("15.8K selector is deterministic, bounded, and stratum-aware", () => {
  const records = [
    record("a1", "commerce", "damage"),
    record("a2", "commerce", "damage"),
    record("b1", "commerce", "delay"),
    record("b2", "commerce", "delay"),
    record("c1", "billing", "error"),
    record("c2", "billing", "error"),
  ];
  const first = selectDeterministicNewSupplyReviewSample(records, { sampleSize: 5 });
  const second = selectDeterministicNewSupplyReviewSample(records, { sampleSize: 5 });
  assert.deepEqual(first.map((item) => item.signal.id), second.map((item) => item.signal.id));
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map((item) => `${item.domain}:${item.family}`)).size, 3);
  assert.equal(DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE, 48);
  assert.equal(NEW_SUPPLY_REVIEW_SAMPLE_VERSION, "new-supply-review-sample-v0.1");
});

test("15.8K runner freezes the exact 15.8J authority and stays read-only", async () => {
  const runner = await read("scripts/run-new-supply-review-full-context-yield.mjs");
  assert.match(runner, /PHASE15_8J_EXPECTED_RUNS = 24/);
  assert.match(runner, /PHASE15_8J_EXPECTED_FETCHED = 1157/);
  assert.match(runner, /PHASE15_8J_EXPECTED_NEW_SOURCES = 985/);
  assert.match(runner, /PHASE15_8J_EXPECTED_NEW_REVIEWS = 130/);
  assert.match(runner, /PHASE15_8J_RUN_FINGERPRINT = "df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df"/);
  assert.match(runner, /resolveSourceAdmissionWithFullContext/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /formation_authority_granted: false/);
  assert.match(runner, /recovery_lane_activated: false/);
  assert.doesNotMatch(runner, /resolveSourceAdmissionWithFullContextRecovery/);
});

test("15.8K workflow is manual-only after live closeout and has no acquisition credentials", async () => {
  const workflow = await read(".github/workflows/source-new-supply-review-15-8k.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /ops\/source-new-supply-review-15-8k/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.match(workflow, /--sample-size="\$WORKFLOW_SAMPLE_SIZE"/);
  assert.doesNotMatch(workflow, /NAVER_CLIENT_ID/);
  assert.doesNotMatch(workflow, /NAVER_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
