import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9U binds the exact Source and exact 15.9T outcome", async () => {
  const script = await read("scripts/run-exact-csc-formation-assessment-15-9u.mjs");
  assert.match(script, /b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c/);
  assert.match(script, /db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4/);
  assert.match(script, /phase15\.9t-exact-csc-outcome-v0\.1/);
  assert.match(script, /751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540/);
  assert.match(script, /EXPECTED_CONTEXT_CHAR_COUNT = 3035/);
  assert.match(script, /\.eq\("source_signal_id", signalId\)/);
  assert.match(script, /\.eq\("batch_version", TARGET_OUTCOME_BATCH_VERSION\)/);
  assert.match(script, /source_admission_outcome_id, exactOutcome\.id/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9U refuses ambiguous or repeated Formation authority", async () => {
  const script = await read("scripts/run-exact-csc-formation-assessment-15-9u.mjs");
  assert.match(script, /EXPECTED_OUTCOME_TOTAL = 86/);
  assert.match(script, /EXPECTED_FORMATION_TOTAL_BEFORE = 1/);
  assert.match(script, /ambiguous durable Source Admission authority/);
  assert.match(script, /no prior Formation assessment of any batch/);
  assert.match(script, /batch already exists; rerun is forbidden/);
  assert.match(script, /ar_source_signal_evaluation_samples|Blind evaluation/);
  assert.match(script, /ar_source_incident_links/);
  assert.match(script, /ar_public_problem_evidence_snapshots/);
});

test("15.9U performs only Formation persistence and keeps downstream authority false", async () => {
  const script = await read("scripts/run-exact-csc-formation-assessment-15-9u.mjs");
  assert.match(script, /persistFormationAssessmentForCurator/);
  assert.match(script, /database_write_statements: 1/);
  assert.match(script, /formationAfter, formationBefore \+ 1/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.match(script, /incident_persistence_authorized: false/);
  assert.match(script, /source_incident_link_authorized: false/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /public_evidence_persistence_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9U preserves bounded provider authority and artifact privacy", async () => {
  const script = await read("scripts/run-exact-csc-formation-assessment-15-9u.mjs");
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 1/);
  assert.match(script, /MAX_MODEL_CALLS = 2/);
  for (const forbidden of [
    "source_signal_id",
    "source_admission_outcome_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "provider_request_id",
    "incident_id",
    "public_problem_id",
  ]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});

test("15.9U temporary live workflow is removed after closeout", async () => {
  const workflowUrl = new URL("../.github/workflows/source-exact-csc-formation-15-9u.yml", import.meta.url);
  await assert.rejects(access(workflowUrl));
});
