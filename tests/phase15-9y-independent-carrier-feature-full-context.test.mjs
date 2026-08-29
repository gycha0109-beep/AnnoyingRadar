import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9Y binds one exact independent carrier-feature Source", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
  assert.match(script, /0a12063489fec74e1219ae11378f06867ea33938affd432f95b9a37c5dab36c3/);
  assert.match(script, /b2f0cf6d42e8d8c9916f285883b690cf5b169069f8ce62cf3721697b49b00c66/);
  assert.match(script, /cuzred\.tistory\.com/);
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9Y probe froze its expected deterministic Admission before network use", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
  assert.match(script, /title_explicit_complaint_requires_context/);
  assert.match(script, /admission\.decision, "review"/);
  assert.match(script, /admission\.requires_full_context, true/);
  assert.match(script, /classifySourceAdmission/);
});

test("15.9Y probe used bounded external-web full-context resolution", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
  assert.match(script, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 4/);
  assert.match(script, /MAX_MODEL_CALLS = 1/);
  assert.match(script, /resolveSourceAdmissionWithFullContext/);
});

test("15.9Y is read-only and preserves curator/publication authority", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
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

test("15.9Y preserves the two-distinct-Incident promotion gate", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
  assert.match(script, /existing_csc_incident_count: 1/);
  assert.match(script, /existing_csc_source_count: 2/);
  assert.match(script, /minimum_distinct_incidents_required: 2/);
  assert.match(script, /distinct_incident_support_missing/);
  assert.match(script, /public_problem_draft_ready: false/);
});

test("15.9Y artifact excludes raw/internal source authority", async () => {
  const script = await read("scripts/run-independent-carrier-feature-full-context-15-9y.mjs");
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

test("15.9Y temporary workflow is removed after live closeout", async () => {
  await assert.rejects(
    read(".github/workflows/source-independent-carrier-feature-full-context-15-9y.yml"),
    (error) => error?.code === "ENOENT",
  );
});
