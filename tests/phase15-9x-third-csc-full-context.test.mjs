import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9X binds one exact unassigned CSC Source", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /60ca0eebb603aa22bad4f73f31d275d7f37af13b20da5499ca0a041d26c56818/);
  assert.match(script, /a1b35603bfd16782a77edf0b5dba3488e1fc03bf550bb24e4733c8ca0f4d1fc6/);
  assert.match(script, /conetrue\.tistory\.com/);
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.match(script, /must have zero durable full-context outcomes/);
  assert.match(script, /must have zero Formation assessments/);
  assert.match(script, /must have zero Incident links/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9X explicitly opts external-web fetch into bounded public HTML", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 4/);
  assert.match(script, /MAX_MODEL_CALLS = 1/);
  assert.match(script, /resolveSourceAdmissionWithFullContext/);
});

test("15.9X is read-only and preserves Incident/Public authority", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /durable_outcome_authorized: false/);
  assert.match(script, /formation_authorized: false/);
  assert.match(script, /incident_authorized: false/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /public_evidence_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome/);
  assert.doesNotMatch(script, /persistSourceFormationAssessment/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9X records the structural promotion blocker instead of bypassing it", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /existing_csc_incident_count: 1/);
  assert.match(script, /existing_csc_source_count: 2/);
  assert.match(script, /minimum_distinct_incidents_required: 2/);
  assert.match(script, /distinct_incident_support_missing/);
  assert.match(script, /public_problem_draft_ready: false/);
});

test("15.9X artifact excludes raw/internal source authority", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "provider_request_id",
    "incident_id",
    "curator_user_id",
    "public_problem_id",
  ]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});

test("15.9X temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-third-csc-full-context-15-9x.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9X_THIRD_CSC_FULL_CONTEXT: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});
