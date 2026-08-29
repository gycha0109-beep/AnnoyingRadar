import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9AC binds one exact canonical Source and deterministic review reason", async () => {
  const script = await read("scripts/run-retail-activation-full-context-15-9ac.mjs");
  assert.match(script, /7ff6763ae09d4d04952fe30e074a72952d155e6e5889573cb547947981c1bc89/);
  assert.match(script, /4ee142cf0651b03b1f146b3167493814b0546d8a450b96ca0ff90b482c65f7c0/);
  assert.match(script, /title_truncated_complaint_ambiguous/);
  assert.match(script, /assert\.deepEqual\(admission\.reason_codes/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9AC is bounded read-only semantic resolution", async () => {
  const script = await read("scripts/run-retail-activation-full-context-15-9ac.mjs");
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 1/);
  assert.match(script, /MAX_MODEL_CALLS = 1/);
  assert.match(script, /resolveSourceAdmissionWithFullContext\(signal, \{ fetchImpl: countedFetch \}\)/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /durable_outcome_authorized: false/);
  assert.match(script, /formation_authorized: false/);
  assert.match(script, /incident_authorized: false/);
  assert.match(script, /publication_authorized: false/);
});

test("15.9AC protects the current two-Source one-Incident CSC baseline", async () => {
  const script = await read("scripts/run-retail-activation-full-context-15-9ac.mjs");
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.match(script, /closed two-Source CSC baseline/);
  assert.match(script, /must remain outside Public Evidence/);
});

test("15.9AC artifact omits raw content and internal governed identifiers", async () => {
  const script = await read("scripts/run-retail-activation-full-context-15-9ac.mjs");
  assert.match(script, /evidence_quote_sha256/);
  for (const forbidden of ["source_signal_id", "canonical_url", "author_handle", "raw_text", "content_text", "provider_request_id", "incident_id", "curator_decision_id", "public_problem_id"]) {
    assert.match(script, new RegExp(`\\"${forbidden}\\"`));
  }
});

test("15.9AC temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-retail-activation-full-context-15-9ac.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9AC_RETAIL_ACTIVATION_FULL_CONTEXT: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});
