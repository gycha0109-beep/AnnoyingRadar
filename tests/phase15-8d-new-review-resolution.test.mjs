import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  reconstructExactNewSourceRecords,
  selectDeterministicReviewSample,
  summarizeReviewSample,
  NEW_REVIEW_SAMPLE_VERSION,
} from "../lib/sources/new-review-sampling.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function run(id, domain, family, start = "2026-08-25T00:00:00Z", end = "2026-08-25T00:01:00Z") {
  return {
    id,
    source_platform: "naver_blog",
    query_text: `${domain}-${family}`,
    started_at: start,
    completed_at: end,
    request_metadata: {
      discovery_query_key: `${domain}__${family}__1`,
      discovery_domain: domain,
      discovery_family: family,
      discovery_page_start: 1,
      discovery_allocation_mode: "exploration",
    },
  };
}

function signal(id, firstSeen) {
  return {
    id,
    source_platform: "naver_blog",
    canonical_url: `https://blog.naver.com/example/${String(10000000 + id)}`,
    raw_text: `signal ${id}`,
    first_seen_at: firstSeen,
  };
}

test("reconstruction keeps only Source identities first seen inside their exact run window", () => {
  const runs = [run("r1", "refund", "damage")];
  const observations = [
    { ingestion_run_id: "r1", source_signal_id: 1 },
    { ingestion_run_id: "r1", source_signal_id: 2 },
  ];
  const signals = [
    signal(1, "2026-08-25T00:00:30Z"),
    signal(2, "2026-08-24T23:59:59Z"),
  ];

  const records = reconstructExactNewSourceRecords({ runs, observations, signals });
  assert.equal(records.length, 1);
  assert.equal(records[0].signal.id, 1);
  assert.equal(records[0].domain, "refund");
  assert.equal(records[0].family, "damage");
});

test("bounded Review sample is deterministic and rotates across domain-family strata", () => {
  const records = [
    ...Array.from({ length: 5 }, (_, index) => ({ run: {}, signal: signal(index + 1, "2026-08-25T00:00:30Z"), query_key: "commerce__damage__1", domain: "commerce", family: "damage" })),
    ...Array.from({ length: 5 }, (_, index) => ({ run: {}, signal: signal(index + 11, "2026-08-25T00:00:30Z"), query_key: "housing__damage__1", domain: "housing", family: "damage" })),
    ...Array.from({ length: 5 }, (_, index) => ({ run: {}, signal: signal(index + 21, "2026-08-25T00:00:30Z"), query_key: "refund__delay__1", domain: "refund", family: "delay" })),
  ];

  const first = selectDeterministicReviewSample(records, { sampleSize: 6 });
  const second = selectDeterministicReviewSample(records, { sampleSize: 6 });
  assert.equal(NEW_REVIEW_SAMPLE_VERSION, "exact-new-review-sample-v0.1");
  assert.deepEqual(first.map((item) => item.signal.id), second.map((item) => item.signal.id));
  assert.equal(first.length, 6);
  assert.deepEqual(summarizeReviewSample(first).by_stratum, {
    "commerce:damage": 2,
    "housing:damage": 2,
    "refund:delay": 2,
  });
});

test("sampling does not exceed the available queue", () => {
  const records = [
    { run: {}, signal: signal(1, "2026-08-25T00:00:30Z"), query_key: "refund__damage__1", domain: "refund", family: "damage" },
    { run: {}, signal: signal(2, "2026-08-25T00:00:30Z"), query_key: "refund__damage__1", domain: "refund", family: "damage" },
  ];
  assert.equal(selectDeterministicReviewSample(records, { sampleSize: 24 }).length, 2);
});

test("Phase 15.8D runner paginates observation reads beyond Supabase default row limit", async () => {
  const runner = await read("scripts/run-new-review-full-context-resolution.mjs");
  assert.match(runner, /OBSERVATION_PAGE_SIZE = 1000/);
  assert.match(runner, /\.order\("ingestion_run_id"/);
  assert.match(runner, /\.order\("source_signal_id"/);
  assert.match(runner, /\.range\(from, to\)/);
  assert.match(runner, /if \(page\.length < OBSERVATION_PAGE_SIZE\) break/);
  assert.match(runner, /from \+= OBSERVATION_PAGE_SIZE/);
  assert.match(runner, /observation_rows: observations\.length/);
});

test("Phase 15.8D runner reuses the existing full-context authority and remains DB read-only", async () => {
  const runner = await read("scripts/run-new-review-full-context-resolution.mjs");
  assert.match(runner, /resolveSourceAdmissionWithFullContext/);
  assert.match(runner, /classifySourceAdmission/);
  assert.match(runner, /NEW_SOURCE_ADMISSION_TELEMETRY_VERSION/);
  assert.match(runner, /new_admission_review_count/);
  assert.match(runner, /assert\.equal\(reviewQueue\.length, expectedReviews/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /full_source_bodies_persisted: 0/);
  assert.doesNotMatch(runner, /getEvaluationSampleIds|loadCampaignPool/);
  assert.doesNotMatch(runner, /content_text: result\.full_context|evidence_quote:/);
});

test("Phase 15.8D workflow remains manual-only after empirical pilot closeout", async () => {
  const workflow = await read(".github/workflows/source-review-resolution-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /ops\/source-review-resolution-pilot/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.match(workflow, /run-new-review-full-context-resolution\.mjs --live/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
