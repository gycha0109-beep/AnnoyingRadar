import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9Z freezes eight first-hand carrier-feature search queries", async () => {
  const plan = await read("lib/sources/phase15-9z-first-hand-carrier-feature-plan.mjs");
  for (const query of [
    "자급제 채팅플러스 안됨 후기",
    "자급제폰 채팅플러스 안됨 경험",
    "자급제 투폰 안됨 후기",
    "자급제 넘버플러스 최악",
    "자급제폰 부가서비스 안됨 후기",
    "통신사 부가서비스 자급제 불편 후기",
    "CSC 변경 채팅플러스 비추천",
    "CSC 변경 투폰 불편 후기",
  ]) assert.match(plan, new RegExp(query));
  assert.match(plan, /PHASE15_9Z_QUERY_LIMIT = 50/);
  assert.match(plan, /PHASE15_9Z_MAX_REQUESTS = 8/);
  assert.match(plan, /carrier_csc_feature_restriction_case/);
  assert.match(plan, /result_opportunity_count/);
});

test("15.9Z acquisition is one-shot and protects the governed CSC baseline", async () => {
  const script = await read("scripts/run-first-hand-carrier-feature-search-15-9z.mjs");
  assert.match(script, /first_hand_carrier_feature_campaign_version/);
  assert.match(script, /campaign already executed; duplicate live run forbidden/);
  assert.match(script, /PHASE15_9Z_PROTECTED_INCIDENT_KEY/);
  assert.match(script, /exactly two Sources linked to the existing CSC Incident/);
  assert.match(script, /existing CSC Incident must remain outside Public Evidence/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9Z writes only acquisition supply and freezes downstream domains", async () => {
  const script = await read("scripts/run-first-hand-carrier-feature-search-15-9z.mjs");
  assert.match(script, /createSourceIngestionRun/);
  assert.match(script, /persistDiscoveredSourceSignals/);
  assert.match(script, /full_context_mutations: 0/);
  assert.match(script, /formation_mutations: 0/);
  assert.match(script, /incident_mutations: 0/);
  assert.match(script, /public_problem_mutations: 0/);
  assert.match(script, /publication_mutations: 0/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome/);
  assert.doesNotMatch(script, /persistSourceFormationAssessment/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9Z artifact excludes raw/internal Source authority", async () => {
  const script = await read("scripts/run-first-hand-carrier-feature-search-15-9z.mjs");
  assert.match(script, /source_identity_sha256/);
  assert.match(script, /source_content_sha256/);
  assert.match(script, /admission_decision/);
  assert.match(script, /requires_full_context/);
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "source_url",
    "author_handle",
    "raw_text",
    "incident_id",
    "curator_user_id",
    "public_problem_id",
    "provider_request_id",
  ]) assert.match(script, new RegExp(`\\"${forbidden}`));
});

test("15.9Z temporary workflow is removed after live closeout", async () => {
  await assert.rejects(
    read(".github/workflows/source-first-hand-carrier-feature-search-15-9z.yml"),
    (error) => error?.code === "ENOENT",
  );
});
