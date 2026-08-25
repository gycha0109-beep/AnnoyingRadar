import { createHash } from "node:crypto";

export const NEW_SUPPLY_REVIEW_SAMPLE_VERSION = "new-supply-review-sample-v0.1";
export const DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE = 48;

function stableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function selectDeterministicNewSupplyReviewSample(records, {
  sampleSize = DEFAULT_NEW_SUPPLY_REVIEW_SAMPLE_SIZE,
} = {}) {
  if (!Number.isInteger(sampleSize) || sampleSize < 1) {
    throw new RangeError("sampleSize must be a positive integer");
  }

  const buckets = new Map();
  for (const record of records ?? []) {
    const stratum = `${record.domain}:${record.family}`;
    const bucket = buckets.get(stratum) ?? [];
    bucket.push(record);
    buckets.set(stratum, bucket);
  }

  for (const [stratum, bucket] of buckets.entries()) {
    bucket.sort((left, right) => {
      const leftKey = stableHash(`${NEW_SUPPLY_REVIEW_SAMPLE_VERSION}:${stratum}:${left.query_key}:${left.signal.id}`);
      const rightKey = stableHash(`${NEW_SUPPLY_REVIEW_SAMPLE_VERSION}:${stratum}:${right.query_key}:${right.signal.id}`);
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
      return String(left.signal.id).localeCompare(String(right.signal.id));
    });
  }

  const strata = [...buckets.keys()].sort();
  const selected = [];
  const boundedSize = Math.min(sampleSize, records?.length ?? 0);
  let cursor = 0;

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
