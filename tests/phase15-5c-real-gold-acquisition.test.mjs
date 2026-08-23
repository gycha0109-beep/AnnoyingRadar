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
  assert.deepEqual(summary.buckets, { complaint_heavy: 8, domain_friction: 16, domain_neutral: 8, noise: 8 });
  assert.equal(new Set(plan.map((item) => item.query_key)).size, plan.length);
  assert.ok(plan.every((item) => item.input.limit === 20));
  assert.ok(plan.every((item) => item.input.request_metadata.campaign_version === GOLD_ACQUISITION_CAMPAIGN_VERSION));
  assert.ok(plan.every((item) => item.input.request_metadata.campaign_query_key === item.query_key));
});

test("legacy Gold benchmark contract remains historically intact", () => {
  assert.equal(GOLD_BENCHMARK_VERSION, "gold-v0.1-benchmark-v1");
  assert.equal(GOLD_BENCHMARK_SIZE, 300);
  assert.equal(GOLD_CALIBRATION_SIZE, 200);
  assert.equal(GOLD_HOLDOUT_SIZE, 100);
});

test("benchmark migrations make legacy membership append-only and freeze legacy Gold annotations", async () => {
  const [migration, hardening] = await Promise.all([
    read("supabase/migrations/026_real_gold_acquisition_campaign.sql"),
    read("supabase/migrations/027_real_gold_benchmark_grant_hardening.sql"),
  ]);
  assert.match(migration, /create table if not exists public\.ar_source_signal_gold_benchmark_memberships/);
  assert.match(migration, /Frozen Gold benchmark annotations are immutable/);
  assert.match(hardening, /grant select, insert on table public\.ar_source_signal_gold_benchmark_memberships\s+to service_role/);
  assert.doesNotMatch(hardening, /grant[^;]*(?:delete|update|truncate)/i);
});

test("campaign runner is resumable, provenance-preserving, and never turns a thin pool into PASS", async () => {
  const runner = await read("scripts/run-gold-acquisition-campaign.mjs");
  assert.match(runner, /getCompletedGoldCampaignQueryKeys/);
  assert.match(runner, /MINIMUM_POOL_TARGET = 600/);
  assert.match(runner, /CONTINUATION_REQUIRED_POOL_BELOW_TARGET/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
});

test("legacy Gold freeze endpoint remains curator-only for historical compatibility", async () => {
  const route = await read("app/api/radar/admin/source-signals/gold/freeze/route.js");
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /freezeGoldBenchmark/);
});

test("Source Lab preserves 15.5C acquisition metrics while Phase 15.5D replaces the active evaluation workflow", async () => {
  const [page, vercel] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("vercel.json"),
  ]);
  assert.match(page, /Phase 15\.5D/);
  assert.match(page, /getGoldCampaignProgress/);
  assert.match(page, /unique_signal_pool/);
  assert.match(page, /BlindEvaluationControl/);
  assert.match(page, /AI Silver/);
  assert.doesNotMatch(page, /GoldBenchmarkFreezeControl/);
  assert.equal(JSON.parse(vercel).git.deploymentEnabled, false);
});
