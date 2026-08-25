import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8J runs exactly one bounded 24-request acquisition batch from authoritative main", async () => {
  const workflow = await read(".github/workflows/source-discovery-expansion-15-8j.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ops\/source-discovery-expansion-15-8j/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-source-discovery-campaign\.mjs --live --max-requests=24/);
  assert.match(workflow, /ALLOW_SOURCE_DISCOVERY_EXPANSION: "1"/);
  assert.match(workflow, /NAVER_CLIENT_ID/);
  assert.match(workflow, /NAVER_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("15.8J reuses active v0.4 discovery allocation and the existing downstream boundary assertion", async () => {
  const runner = await read("scripts/run-source-discovery-campaign.mjs");
  const plan = await read("lib/sources/discovery-query-plan.mjs");
  assert.match(runner, /selectDiscoveryRequestBudget\(plan, historicalMetrics/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /blind_120_reads: 0/);
  assert.match(runner, /full_source_body_fetches: 0/);
  assert.match(runner, /publication_mutations: 0/);
  assert.match(plan, /source-discovery-allocation-v0\.4/);
});

test("15.8J does not modify the historical manual-only Source Discovery Pilot", async () => {
  const historical = await read(".github/workflows/source-discovery-pilot.yml");
  assert.match(historical, /workflow_dispatch:/);
  assert.doesNotMatch(historical, /push:/);
  assert.match(historical, /default: "12"/);
});
