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
  assert.match(script, /\["ar_source_full_context_resolution_outcomes", "durable full-context outcomes"\]/);
  assert.match(script, /\["ar_source_formation_assessments", "Formation assessments"\]/);
  assert.match(script, /\["ar_source_incident_links", "Incident links"\]/);
  assert.match(script, /15\.9X target must have zero \$\{label\}/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9X external-web fetch remains bounded and read-only", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 4/);
  assert.match(script, /MAX_MODEL_CALLS = 1/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome/);
  assert.doesNotMatch(script, /persistSourceFormationAssessment/);
});

test("15.9X records structural promotion blocker", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  assert.match(script, /existing_csc_incident_count: 1/);
  assert.match(script, /existing_csc_source_count: 2/);
  assert.match(script, /minimum_distinct_incidents_required: 2/);
  assert.match(script, /distinct_incident_support_missing/);
  assert.match(script, /public_problem_draft_ready: false/);
});

test("15.9X artifact excludes raw/internal authority", async () => {
  const script = await read("scripts/run-third-csc-full-context-resolution-15-9x.mjs");
  for (const forbidden of ["source_signal_id", "canonical_url", "author_handle", "raw_text", "content_text", "provider_request_id", "incident_id", "curator_user_id", "public_problem_id"]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});

test("15.9X temporary live workflow remains removed after closeout", async () => {
  await assert.rejects(
    read(".github/workflows/source-third-csc-full-context-15-9x.yml"),
    (error) => error?.code === "ENOENT",
  );
});
