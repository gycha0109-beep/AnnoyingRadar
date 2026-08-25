import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { selectDeterministicReviewSample } from "../lib/sources/new-review-sampling.mjs";
import {
  assertDisjointReviewSamples,
  buildExclusionIds,
  selectDeterministicReviewHoldout,
  DEFAULT_REVIEW_HOLDOUT_SIZE,
  NEW_REVIEW_HOLDOUT_VERSION,
  ORIGINAL_REVIEW_SAMPLE_SIZE,
} from "../lib/sources/new-review-holdout.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function makeRecord(index, domain = `domain-${index % 6}`, family = index % 2 === 0 ? "damage" : "delay") {
  return {
    domain,
    family,
    query_key: `${domain}__${family}__${index % 3}`,
    signal: { id: `signal-${String(index).padStart(3, "0")}` },
  };
}

test("Phase 15.8F versions a 48-item holdout separately from the original 24-item sample", () => {
  assert.equal(NEW_REVIEW_HOLDOUT_VERSION, "exact-new-review-holdout-v0.1");
  assert.equal(ORIGINAL_REVIEW_SAMPLE_SIZE, 24);
  assert.equal(DEFAULT_REVIEW_HOLDOUT_SIZE, 48);
});

test("holdout deterministically excludes every original 15.8D sample identity", () => {
  const queue = Array.from({ length: 166 }, (_, index) => makeRecord(index));
  const original = selectDeterministicReviewSample(queue, { sampleSize: ORIGINAL_REVIEW_SAMPLE_SIZE });
  const excluded = buildExclusionIds(original);
  const holdout = selectDeterministicReviewHoldout(queue, {
    sampleSize: DEFAULT_REVIEW_HOLDOUT_SIZE,
    excludeIds: excluded,
  });
  const repeated = selectDeterministicReviewHoldout([...queue].reverse(), {
    sampleSize: DEFAULT_REVIEW_HOLDOUT_SIZE,
    excludeIds: excluded,
  });

  assert.equal(original.length, 24);
  assert.equal(holdout.length, 48);
  assertDisjointReviewSamples(original, holdout);
  assert.deepEqual(holdout.map((row) => row.signal.id), repeated.map((row) => row.signal.id));
});

test("holdout bounds to the remaining queue after exclusions", () => {
  const queue = Array.from({ length: 30 }, (_, index) => makeRecord(index));
  const original = selectDeterministicReviewSample(queue, { sampleSize: 24 });
  const holdout = selectDeterministicReviewHoldout(queue, {
    sampleSize: 48,
    excludeIds: buildExclusionIds(original),
  });
  assert.equal(holdout.length, 6);
  assertDisjointReviewSamples(original, holdout);
});

test("Phase 15.8F runner freezes the original exact telemetry window and fails closed on drift", async () => {
  const runner = await read("scripts/run-new-review-full-context-holdout.mjs");
  assert.match(runner, /PHASE15_8D_EXACT_RUN_CUTOFF = "2026-08-25T02:29:36\.982Z"/);
  assert.match(runner, /PHASE15_8D_EXPECTED_EXACT_RUNS = 24/);
  assert.match(runner, /PHASE15_8D_EXPECTED_EXACT_NEW = 961/);
  assert.match(runner, /PHASE15_8D_EXPECTED_REVIEWS = 166/);
  assert.match(runner, /assertDisjointReviewSamples/);
  assert.match(runner, /overlap_count: 0/);
});

test("Phase 15.8F live runner stays read-only and aggregate-only", async () => {
  const runner = await read("scripts/run-new-review-full-context-holdout.mjs");
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /publication_mutations: 0/);
  assert.match(runner, /active_allocation_mutations: 0/);
  assert.match(runner, /individual_source_identities_emitted: false/);
  assert.doesNotMatch(runner, /resolutions:\s*results\.map/);
  assert.doesNotMatch(runner, /getEvaluationSampleIds|ar_source_signal_evaluation_samples/);
});

test("Phase 15.8F closeout returns the holdout workflow to manual-only", async () => {
  const workflow = await read(".github/workflows/source-review-holdout-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /ops\/source-review-holdout-pilot/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("Phase 15.8F closeout records disjoint live evidence and leaves v0.4 active", async () => {
  const doc = await read("docs/phase15-8f-review-promotion-holdout.md");
  assert.match(doc, /\*\*CLOSED — IMPLEMENTED \/ CI VERIFIED \/ PIE VERIFIED \/ LIVE HOLDOUT VERIFIED \/ MERGED\*\*/);
  assert.match(doc, /32807308702/);
  assert.match(doc, /9548700358/);
  assert.match(doc, /overlap count: 0/);
  assert.match(doc, /7 \/ 48 = 14\.58%/);
  assert.match(doc, /11 \/ 72 = 15\.28%/);
  assert.match(doc, /source_full_context_provider_incomplete: 5/);
  assert.match(doc, /source_full_context_invalid_evidence_quote: 3/);
  assert.match(doc, /Blind evaluation samples: 120/);
  assert.match(doc, /source-discovery-allocation-v0\.4/);
});
