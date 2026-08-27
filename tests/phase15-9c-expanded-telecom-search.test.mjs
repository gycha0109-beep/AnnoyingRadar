import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_9CExpandedPlan,
  getPhase15_9CPlanSummary,
  PHASE15_9C_MAX_REQUESTS,
  PHASE15_9C_QUERY_LIMIT,
  PHASE15_9C_SEED_CONTENT_SHA256,
  PHASE15_9C_SEED_IDENTITY_SHA256,
} from "../lib/sources/phase15-9c-expanded-telecom-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9C broadens vocabulary and switches to similarity sort", () => {
  const plan = buildPhase15_9CExpandedPlan();
  const summary = getPhase15_9CPlanSummary();
  assert.equal(PHASE15_9C_MAX_REQUESTS, 8);
  assert.equal(PHASE15_9C_QUERY_LIMIT, 50);
  assert.equal(plan.length, 8);
  assert.equal(summary.result_opportunity_count, 400);
  assert.equal(summary.expansion_axis, "shorter_queries_plus_similarity_sort");
  assert.equal(summary.search_focus_authority, "search_focus_not_problem_signature");
  assert.deepEqual(plan.map((item) => item.input.q), [
    "알뜰폰 번호이동 안됨",
    "번호이동 제한 해제",
    "번호이동 제한서비스",
    "번호이동 제한서비스 해지",
    "번호이동 제한서비스 해제",
    "번호이동 차단",
    "번호이동 막힘",
    "알뜰폰 번호이동 제한",
  ]);
  assert.equal(plan.every((item) => item.input.sort === "sim" && item.input.start === 1 && item.input.limit === 50), true);
  assert.equal(new Set(plan.map((item) => item.query_key)).size, 8);
});

test("15.9C inherits the frozen singleton seed authority", () => {
  assert.match(PHASE15_9C_SEED_IDENTITY_SHA256, /^[0-9a-f]{64}$/);
  assert.match(PHASE15_9C_SEED_CONTENT_SHA256, /^[0-9a-f]{64}$/);
});

test("15.9C runner keeps acquisition upstream of full-context and Incident identity", async () => {
  const script = await read("scripts/run-expanded-telecom-search-15-9c.mjs");
  assert.match(script, /ALLOW_PHASE15_9C_EXPANDED_ACQUISITION/);
  assert.match(script, /createSourceIngestionRun/);
  assert.match(script, /persistDiscoveredSourceSignals/);
  assert.match(script, /signal\.external_content_id !== PHASE15_9C_SEED_IDENTITY_SHA256/);
  assert.match(script, /sourceRows\[0\]\.content_hash, PHASE15_9C_SEED_CONTENT_SHA256/);
  assert.match(script, /blind_120_reads: 0/);
  assert.match(script, /full_source_body_fetches: 0/);
  assert.match(script, /external_model_calls: 0/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /problem_signature_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
});

test("15.9C workflow remains bounded one-shot before closeout", async () => {
  const workflow = await read(".github/workflows/source-expanded-telecom-search-15-9c.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9c-live-execution/);
  assert.match(workflow, /ALLOW_PHASE15_9C_EXPANDED_ACQUISITION: "true"/);
  assert.match(workflow, /run-expanded-telecom-search-15-9c\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});
