import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_9BTargetedPlan,
  getPhase15_9BPlanSummary,
  PHASE15_9B_MAX_REQUESTS,
  PHASE15_9B_QUERY_LIMIT,
  PHASE15_9B_SEED_IDENTITY_SHA256,
} from "../lib/sources/phase15-9b-targeted-telecom-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9B freezes exactly four bounded targeted telecom queries", () => {
  const plan = buildPhase15_9BTargetedPlan();
  const summary = getPhase15_9BPlanSummary();
  assert.equal(PHASE15_9B_MAX_REQUESTS, 4);
  assert.equal(PHASE15_9B_QUERY_LIMIT, 50);
  assert.equal(plan.length, 4);
  assert.equal(summary.result_opportunity_count, 200);
  assert.equal(summary.search_focus_authority, "search_focus_not_problem_signature");
  assert.deepEqual(plan.map((item) => item.input.q), [
    "알뜰폰 번호이동 제한 강제",
    "통신사 번호이동 제한 해제 안됨",
    "번호이동 제한서비스 자동 가입",
    "통신사 번호이동 막힘 피해",
  ]);
  assert.equal(new Set(plan.map((item) => item.query_key)).size, 4);
  assert.equal(plan.every((item) => item.input.sort === "date" && item.input.start === 1 && item.input.limit === 50), true);
});

test("15.9B keeps the held seed hash-only and never treats it as a new source", () => {
  assert.match(PHASE15_9B_SEED_IDENTITY_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(PHASE15_9B_SEED_IDENTITY_SHA256, "1ec3b0beca3fe1278fec4c9fd0e5cc20273bf4dbeba06990b19f3ab51d0e900c");
});

test("15.9B runner mutates Source supply only and forbids downstream authority", async () => {
  const script = await read("scripts/run-targeted-telecom-acquisition-15-9b.mjs");
  assert.match(script, /createSourceIngestionRun/);
  assert.match(script, /persistDiscoveredSourceSignals/);
  assert.match(script, /ALLOW_PHASE15_9B_TARGETED_ACQUISITION/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /problem_signature_authorized: false/);
  assert.match(script, /public_problem_creation_authorized: false/);
  assert.match(script, /public_evidence_persistence_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.match(script, /blind_120_reads: 0/);
  assert.match(script, /full_source_body_fetches: 0/);
  assert.match(script, /external_model_calls: 0/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
  assert.doesNotMatch(script, /ar_add_incident_bound_public_problem_evidence/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
});

test("15.9B artifact uses safe Source fingerprints and excludes raw lineage/location fields", async () => {
  const script = await read("scripts/run-targeted-telecom-acquisition-15-9b.mjs");
  assert.match(script, /source_identity_sha256/);
  assert.match(script, /source_content_sha256/);
  assert.match(script, /distinct_from_seed/);
  for (const field of ["source_signal_id", "canonical_url", "source_url", "author_handle", "raw_text", "incident_id", "public_problem_id"]) {
    assert.match(script, new RegExp(`\\"${field}\\"`));
  }
});

test("15.9B workflow is bounded and one-shot", async () => {
  const workflow = await read(".github/workflows/source-targeted-telecom-acquisition-15-9b.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9b-live-execution/);
  assert.match(workflow, /ALLOW_PHASE15_9B_TARGETED_ACQUISITION: "true"/);
  assert.match(workflow, /run-targeted-telecom-acquisition-15-9b\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});
