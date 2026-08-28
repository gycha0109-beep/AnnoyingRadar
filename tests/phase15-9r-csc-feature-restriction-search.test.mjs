import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_9RCscFeatureRestrictionPlan,
  getPhase15_9RCscFeatureRestrictionPlanSummary,
  PHASE15_9R_MAX_REQUESTS,
  PHASE15_9R_PROTECTED_DECISION_ID,
  PHASE15_9R_PROTECTED_INCIDENT_KEY,
  PHASE15_9R_PROTECTED_SOURCE_CONTENT_SHA256,
  PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
  PHASE15_9R_QUERY_LIMIT,
} from "../lib/sources/phase15-9r-csc-feature-restriction-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9R freezes eight mechanism-focused similarity queries", () => {
  const plan = buildPhase15_9RCscFeatureRestrictionPlan();
  const summary = getPhase15_9RCscFeatureRestrictionPlanSummary();

  assert.equal(PHASE15_9R_MAX_REQUESTS, 8);
  assert.equal(PHASE15_9R_QUERY_LIMIT, 50);
  assert.equal(plan.length, 8);
  assert.equal(summary.result_opportunity_count, 400);
  assert.equal(summary.acquisition_goal, "find_second_independent_organic_case");
  assert.equal(
    summary.search_focus_authority,
    "search_focus_not_problem_signature_or_incident_authority",
  );
  assert.deepEqual(plan.map((item) => item.input.q), [
    "CSC 변경 채팅플러스 안됨",
    "자급제 CSC 채팅플러스",
    "KOO CSC 채팅플러스",
    "CSC 변경 투폰 안됨",
    "자급제 투폰 안됨",
    "IMEI 채팅플러스 안됨",
    "CSC 변경 RCS 안됨",
    "통신사 CSC 기능 제한",
  ]);
  assert.equal(
    plan.every((item) => item.input.sort === "sim" && item.input.start === 1 && item.input.limit === 50),
    true,
  );
  assert.equal(new Set(plan.map((item) => item.query_key)).size, 8);
});

test("15.9R freezes the protected Source and approved Incident authority", () => {
  assert.match(PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256, /^[0-9a-f]{64}$/);
  assert.match(PHASE15_9R_PROTECTED_SOURCE_CONTENT_SHA256, /^[0-9a-f]{64}$/);
  assert.match(PHASE15_9R_PROTECTED_DECISION_ID, /^[0-9a-f-]{36}$/);
  assert.equal(PHASE15_9R_PROTECTED_INCIDENT_KEY, "carrier_csc_feature_restriction_case");
});

test("15.9R runner is one-shot Source acquisition only", async () => {
  const script = await read("scripts/run-csc-feature-restriction-search-15-9r.mjs");

  assert.match(script, /ALLOW_PHASE15_9R_CSC_ACQUISITION/);
  assert.match(script, /createSourceIngestionRun/);
  assert.match(script, /persistDiscoveredSourceSignals/);
  assert.match(script, /countCampaignRuns/);
  assert.match(script, /duplicate live execution is forbidden/);
  assert.match(script, /assertProtectedAuthorityStillHeld/);
  assert.match(script, /created_from_curator_decision_id/);
  assert.match(script, /protected Source must remain outside Public Evidence/);
  assert.match(script, /full_source_body_fetches: 0/);
  assert.match(script, /external_model_calls: 0/);
  assert.match(script, /full_context_resolution_mutations: 0/);
  assert.match(script, /formation_mutations: 0/);
  assert.match(script, /incident_mutations: 0/);
  assert.match(script, /public_problem_mutations: 0/);
  assert.match(script, /publication_mutations: 0/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /problem_signature_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
  assert.doesNotMatch(script, /ar_add_incident_bound_public_problem_evidence/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
});

test("15.9R temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-csc-feature-restriction-search-15-9r.yml");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9R_CSC_ACQUISITION: "true"/);
  assert.match(workflow, /run-csc-feature-restriction-search-15-9r\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});
