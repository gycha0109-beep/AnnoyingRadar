import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { selectDeterministicNewSupplyReviewSample } from "./new-supply-review-sampling.mjs";

export const PHASE15_8M_B_BATCH_VERSION = "phase15.8m-b-remainder-v0.1";
export const PHASE15_8M_B_EXPECTED_REVIEWS = 130;
export const PHASE15_8M_B_SAMPLE_SIZE = 48;
export const PHASE15_8M_B_EXPECTED_REMAINDER = 82;
export const PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT = "9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6";

export function fingerprintSourceRecords(records) {
  return createHash("sha256")
    .update((records ?? []).map((record) => String(record?.signal?.id ?? "")).sort().join("\n"))
    .digest("hex");
}

export function selectPhase15_8MBRemainder(reviewQueue, {
  expectedReviewCount = PHASE15_8M_B_EXPECTED_REVIEWS,
  sampleSize = PHASE15_8M_B_SAMPLE_SIZE,
  expectedRemainderCount = expectedReviewCount - sampleSize,
  expectedSampleFingerprint = PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT,
} = {}) {
  assert.ok(Array.isArray(reviewQueue), "reviewQueue must be an array");
  assert.equal(reviewQueue.length, expectedReviewCount, "exact Review cohort size drifted");

  const reviewIds = reviewQueue.map((record) => String(record?.signal?.id ?? ""));
  assert.ok(reviewIds.every(Boolean), "every Review record must have a Source Signal id");
  assert.equal(new Set(reviewIds).size, reviewIds.length, "Review cohort Source Signal ids must be unique");

  const sample = selectDeterministicNewSupplyReviewSample(reviewQueue, { sampleSize });
  assert.equal(sample.length, sampleSize, "calibration sample size drifted");
  const sampleFingerprint = fingerprintSourceRecords(sample);
  if (expectedSampleFingerprint != null) {
    assert.equal(sampleFingerprint, expectedSampleFingerprint, "15.8K sample fingerprint drifted");
  }

  const reviewIdSet = new Set(reviewIds);
  const sampleIds = new Set(sample.map((record) => String(record.signal.id)));
  assert.equal(sampleIds.size, sample.length, "calibration sample must not contain duplicate Source Signals");
  for (const sourceId of sampleIds) {
    assert.ok(reviewIdSet.has(sourceId), "calibration sample must be a subset of the exact Review cohort");
  }

  const remainder = reviewQueue.filter((record) => !sampleIds.has(String(record.signal.id)));
  assert.equal(remainder.length, expectedRemainderCount, "unsampled Review remainder size drifted");

  const remainderIds = new Set(remainder.map((record) => String(record.signal.id)));
  assert.equal(remainderIds.size, remainder.length, "remainder Source Signal ids must be unique");
  for (const sourceId of remainderIds) {
    assert.equal(sampleIds.has(sourceId), false, "calibration sample and remainder must be disjoint");
  }

  const unionIds = new Set([...sampleIds, ...remainderIds]);
  assert.equal(unionIds.size, reviewIdSet.size, "sample plus remainder must reconstruct the exact Review cohort");
  for (const sourceId of reviewIdSet) {
    assert.ok(unionIds.has(sourceId), "sample plus remainder must cover every exact Review Source Signal");
  }

  return {
    sample,
    remainder,
    sampleFingerprint,
    remainderFingerprint: fingerprintSourceRecords(remainder),
  };
}
