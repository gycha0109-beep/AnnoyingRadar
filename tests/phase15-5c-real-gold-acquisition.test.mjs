import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildGoldAcquisitionPlan,
  getGoldAcquisitionPlanSummary,
  GOLD_ACQUISITION_CAMPAIGN_VERSION,
  GOLD_BENCHMARK_SIZE,
  GOLD_BENCHMARK_VERSION,
  GOLD_CALIBRATION_SIZE,
  GOLD_HOLDOUT_SIZE,
} from "../lib/sources/gold-campaign.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Gold acquisition plan is fixed at 40 balanced queries and 800 result opportunities", () => {
  const plan = buildGoldAcquisitionPlan();
  const summary = getGoldAcquisitionPlanSummary();

  assert.equal(plan.length, 40);
  assert.equal(summary.query_count, 40);
  assert.equal(summary.result_opportunity_count, 800);
  assert.deepEqual(summary.buckets, {
    complaint_heavy: 8,
    domain_friction: 16,
    domain_neutral: 8,
    noise: 8,
  });
  assert.equal(new Set(plan.map((item) => item.query_key)).size, plan.length);
  assert.ok(plan.every((item) => item.input.limit === 20));
  assert.ok(plan.every((item) => item.input.request_metadata.campaign_version === GOLD_ACQUISITION_CAMPAIGN_VERSION));
  assert.ok(plan.every((item) => item.input.request_metadata.campaign_query_key === item.query_key));
  assert.ok(plan.some((item) => item.bucket === "noise" && item.input.sort === "sim"));
  assert.ok(plan.some((item) => item.bucket === "complaint_heavy" && item.input.sort === "date"));
});

test("Gold benchmark contract is exactly 300 = 200 calibration + 100 locked holdout", () => {
  assert.equal(GOLD_BENCHMARK_VERSION, "gold-v0.1-benchmark-v1");
  assert.equal(GOLD_BENCHMARK_SIZE, 300);
  assert.equal(GOLD_CALIBRATION_SIZE, 200);
  assert.equal(GOLD_HOLDOUT_SIZE, 100);
  assert.equal(GOLD_CALIBRATION_SIZE + GOLD_HOLDOUT_SIZE, GOLD_BENCHMARK_SIZE);
});

test("benchmark migrations make membership append-only and freeze Gold annotations", async () => {
  const [migration, hardening] = await Promise.all([
    read("supabase/migrations/026_real_gold_acquisition_campaign.sql"),
    read("supabase/migrations/027_real_gold_benchmark_grant_hardening.sql"),
  ]);
  assert.match(migration, /create table if not exists public\.ar_source_signal_gold_benchmark_memberships/);
  assert.match(migration, /evaluation_partition in \('calibration', 'holdout'\)/);
  assert.match(migration, /unique \(benchmark_version, source_signal_id\)/);
  assert.match(migration, /unique \(benchmark_version, sample_rank\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.ar_source_signal_gold_benchmark_memberships\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert on table public\.ar_source_signal_gold_benchmark_memberships\s+to service_role/);
  assert.match(migration, /Frozen Gold benchmark annotations are immutable/);
  assert.match(migration, /if tg_op = 'DELETE' then\s+return old;\s+end if;\s+return new;/);
  assert.doesNotMatch(migration, /ar_raw_inputs|ar_pain_evidences|ar_public_problems/);

  assert.match(hardening, /revoke all on table public\.ar_source_signal_gold_benchmark_memberships\s+from public, anon, authenticated, service_role/);
  assert.match(hardening, /grant select, insert on table public\.ar_source_signal_gold_benchmark_memberships\s+to service_role/);
  assert.doesNotMatch(hardening, /grant[^;]*(?:delete|update|truncate)/i);
});

test("campaign runner is resumable, provenance-preserving, and never turns a thin pool into PASS", async () => {
  const runner = await read("scripts/run-gold-acquisition-campaign.mjs");
  assert.match(runner, /getCompletedGoldCampaignQueryKeys/);
  assert.match(runner, /skipped=already_completed/);
  assert.match(runner, /MINIMUM_POOL_TARGET = 600/);
  assert.match(runner, /CONTINUATION_REQUIRED_POOL_BELOW_TARGET/);
  assert.match(runner, /CONTINUATION_REQUIRED_FAILED_QUERIES/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /createSourceIngestionRun/);
  assert.match(runner, /persistSourceSignals/);
});

test("Gold freeze endpoint is curator-only and holdout disappears from the normal review queue", async () => {
  const [route, service] = await Promise.all([
    read("app/api/radar/admin/source-signals/gold/freeze/route.js"),
    read("lib/sources/complaint-service.mjs"),
  ]);
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /freezeGoldBenchmark/);
  assert.match(service, /getHoldoutSignalIds/);
  assert.match(service, /GOLD_REVIEW_CANDIDATE_LIMIT = 1000/);
  assert.match(service, /REVIEW_LOOKUP_CHUNK_SIZE = 200/);
  assert.match(service, /gold-review-v0\.1/);
  assert.match(service, /!holdoutSignalIds\.has\(signal\.id\)/);
});

test("Source Lab exposes campaign progress and freeze control while production deployment stays paused", async () => {
  const [page, control, vercel] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("app/components/gold-benchmark-freeze-control.js"),
    read("vercel.json"),
  ]);
  assert.match(page, /Phase 15\.5C/);
  assert.match(page, /getGoldCampaignProgress/);
  assert.match(page, /getGoldBenchmarkStats/);
  assert.match(page, /GoldBenchmarkFreezeControl/);
  assert.match(page, /unique_signal_pool/);
  assert.match(control, /Gold 200\/100 split 고정/);
  assert.match(control, /labels immutable/);
  assert.equal(JSON.parse(vercel).git.deploymentEnabled, false);
});
