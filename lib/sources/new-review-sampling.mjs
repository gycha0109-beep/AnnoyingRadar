import { createHash } from "node:crypto";

export const NEW_REVIEW_SAMPLE_VERSION = "exact-new-review-sample-v0.1";

function timestamp(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function stableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function reconstructExactNewSourceRecords({ runs, observations, signals }) {
  const runById = new Map((runs ?? []).map((run) => [run.id, run]));
  const signalById = new Map((signals ?? []).map((signal) => [signal.id, signal]));
  const records = [];
  const seen = new Set();

  for (const observation of observations ?? []) {
    const run = runById.get(observation.ingestion_run_id);
    const signal = signalById.get(observation.source_signal_id);
    if (!run || !signal) continue;

    const firstSeen = timestamp(signal.first_seen_at);
    const started = timestamp(run.started_at);
    const completed = timestamp(run.completed_at);
    if (firstSeen === null || started === null || completed === null) continue;
    if (firstSeen < started || firstSeen > completed) continue;

    const identity = `${run.id}:${signal.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    records.push({
      run,
      signal,
      query_key: run.request_metadata?.discovery_query_key ?? `${run.source_platform}:${run.query_text}`,
      domain: run.request_metadata?.discovery_domain ?? "unknown",
      family: run.request_metadata?.discovery_family ?? "unknown",
      page_start: Number(run.request_metadata?.discovery_page_start ?? run.request_metadata?.start ?? 1),
      allocation_mode: run.request_metadata?.discovery_allocation_mode ?? "unknown",
    });
  }

  return records.sort((left, right) => {
    const leftSeen = String(left.signal.first_seen_at ?? "");
    const rightSeen = String(right.signal.first_seen_at ?? "");
    if (leftSeen !== rightSeen) return leftSeen.localeCompare(rightSeen);
    return String(left.signal.id).localeCompare(String(right.signal.id));
  });
}

export function selectDeterministicReviewSample(records, { sampleSize = 24 } = {}) {
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
      const leftKey = stableHash(`${NEW_REVIEW_SAMPLE_VERSION}:${stratum}:${left.query_key}:${left.signal.id}`);
      const rightKey = stableHash(`${NEW_REVIEW_SAMPLE_VERSION}:${stratum}:${right.query_key}:${right.signal.id}`);
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
      return String(left.signal.id).localeCompare(String(right.signal.id));
    });
  }

  const strata = [...buckets.keys()].sort();
  const selected = [];
  let cursor = 0;
  while (selected.length < sampleSize && strata.length > 0) {
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

export function summarizeReviewSample(records) {
  const byDomain = {};
  const byFamily = {};
  const byStratum = {};
  for (const record of records ?? []) {
    byDomain[record.domain] = (byDomain[record.domain] ?? 0) + 1;
    byFamily[record.family] = (byFamily[record.family] ?? 0) + 1;
    const stratum = `${record.domain}:${record.family}`;
    byStratum[stratum] = (byStratum[stratum] ?? 0) + 1;
  }
  return {
    count: records?.length ?? 0,
    by_domain: byDomain,
    by_family: byFamily,
    by_stratum: byStratum,
  };
}
