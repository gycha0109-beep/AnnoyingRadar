import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8I pilot checks out authoritative main and uses only read-side Supabase credentials", async () => {
  const workflow = await read(".github/workflows/source-combined-promotion-shadow-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ops\/source-combined-promotion-shadow/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-discovery-combined-promotion-shadow\.mjs/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(workflow, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /NAVER_CLIENT/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("15.8I runner is telemetry-only and emits no source identity or full-body surface", async () => {
  const runner = await read("scripts/run-discovery-combined-promotion-shadow.mjs");
  assert.match(runner, /listDiscoveryQueryMetrics/);
  assert.doesNotMatch(runner, /listSourceAdmissionQueue/);
  assert.doesNotMatch(runner, /fetchNaverFullContext/);
  assert.doesNotMatch(runner, /resolveSourceAdmissionWithFullContext/);
  assert.doesNotMatch(runner, /source_signal_id/);
  assert.doesNotMatch(runner, /canonical_url/);
  assert.doesNotMatch(runner, /raw_text/);
  assert.match(runner, /full_source_body_fetches: 0/);
});
