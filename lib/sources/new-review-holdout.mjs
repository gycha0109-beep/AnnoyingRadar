import { createHash } from "node:crypto";

export const NEW_REVIEW_HOLDOUT_VERSION = "exact-new-review-holdout-v0.1";
export const ORIGINAL_REVIEW_SAMPLE_SIZE = 24;
export const DEFAULT_REVIEW_HOLDOUT_SIZE = 48;

function stableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function buildExclusionIds(records) {
  return new Set((records ?? []).map((record) => record?.signal?.id).filter(Boolean));
}

export function selectDeterministicReviewHoldout(records, {
  sampleSize = DEFAULT_REVIEW_HOLDOUT_SIZE,
  excludeIds = new Set(),
} = {}) {
  if (!Number.isInteger(sampleSize) || sampleSize < 1) {
    throw new RangeError("sampleSize must be a positive integer");
  }

  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds ?? []);
  const eligible = (records ?? []).filter((record) => !excluded.has(record?.signal?.id));
  const buckets = new Map();

  for (const record of eligible) {
    const stratum = `${record.domain}:${record.family}`;
    const bucket = buckets.get(stratum) ?? [];
    bucket.push(record);
    buckets.set(stratum, bucket);
  }

  for (const [stratum, bucket] of buckets.entries()) {
    bucket.sort((left, right) => {
      const leftKey = stableHash(`${NEW_REVIEW_HOLDOUT_VERSION}:${stratum}:${left.query_key}:${left.signal.id}`);
      const rightKey = stableHash(`${NEW_REVIEW_HOLDOUT_VERSION}:${stratum}:${right.query_key}:${right.signal.id}`);
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
      return String(left.signal.id).localeCompare(String(right.signal.id));
    });
  }

  const strata = [...buckets.keys()].sort();
  const selected = [];
  let cursor = 0;
  const boundedSize = Math.min(sampleSize, eligible.length);

  while (selected.length < boundedSize && strata.length > 0) {
    const stratum = strata[cursor % strata.length];
    const bucket = buckets.get(stratum);
    const item = bucket?.shift();
    if (item) selected.push(item);

    if (!bucket?.length) {
      const index = strata.indexOf(stratum);
      strata.splice(index, 1);
      if (strata.length === 0) break;
      cursor = index % strata.length;
    } else {
      cursor = (cursor + 1) % strata.length;
    }
  }

  return selected;
}

export function assertDisjointReviewSamples(originalSample, holdoutSample) {
  const originalIds = buildExclusionIds(originalSample);
  const overlap = (holdoutSample ?? [])
    .map((record) => record?.signal?.id)
    .filter((id) => id && originalIds.has(id));
  if (overlap.length > 0) {
    throw new Error(`Review holdout overlaps original sample: ${overlap.length}`);
  }
  return true;
}
