import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9AB binds eight exact canonical Source pairs without latest-row inference", async () => {
  const script = await read("scripts/run-carrier-provisioning-admission-triage-15-9ab.mjs");
  assert.match(script, /exact_target_count: TARGETS\.length/);
  assert.match(script, /TARGETS\.length, "15\.9AB exact target set must resolve to eight unique Sources"/);
  assert.match(script, /canonical content hash drifted/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9AB executes only deterministic Admission and authorizes zero downstream mutation", async () => {
  const script = await read("scripts/run-carrier-provisioning-admission-triage-15-9ab.mjs");
  assert.match(script, /classifySourceAdmission\(signal\)/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /durable_outcome_authorized: false/);
  assert.match(script, /formation_authorized: false/);
  assert.match(script, /incident_authorized: false/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome/);
  assert.doesNotMatch(script, /persistSourceFormationAssessment/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9AB protects current two-Source one-Incident CSC baseline", async () => {
  const script = await read("scripts/run-carrier-provisioning-admission-triage-15-9ab.mjs");
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.match(script, /closed two-Source CSC Incident baseline/);
  assert.match(script, /minimum_distinct_incidents_required: 2/);
  assert.match(script, /distinct_incident_support_missing/);
});

test("15.9AB artifact excludes raw Source and curator/public identifiers", async () => {
  const script = await read("scripts/run-carrier-provisioning-admission-triage-15-9ab.mjs");
  for (const forbidden of ["canonical_url:", "author_handle:", "raw_text:", "source_signal_id:", "incident_id:", "curator_user_id:", "public_problem_id:"]) {
    assert.doesNotMatch(script, new RegExp(forbidden));
  }
});

test("15.9AB temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-carrier-provisioning-admission-triage-15-9ab.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9AB_CARRIER_PROVISIONING_ADMISSION_TRIAGE: "true"/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});
