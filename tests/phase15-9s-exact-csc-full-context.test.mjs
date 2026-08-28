import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9S freezes exactly one Source by sanitized identity and content hashes", async () => {
  const script = await read("scripts/run-exact-csc-full-context-resolution-15-9s.mjs");

  assert.match(script, /b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c/);
  assert.match(script, /db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4/);
  assert.match(script, /\.eq\("external_content_id", TARGET_SOURCE_IDENTITY_SHA256\)/);
  assert.match(script, /\.eq\("content_hash", TARGET_SOURCE_CONTENT_SHA256\)/);
  assert.match(script, /data\?\.length, 1/);
  assert.doesNotMatch(script, /order\("(?:created_at|first_seen_at|last_seen_at)"/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9S preserves Admission, blind-evaluation, Incident and Public boundaries", async () => {
  const script = await read("scripts/run-exact-csc-full-context-resolution-15-9s.mjs");

  assert.match(script, /admission\.decision, "review"/);
  assert.match(script, /admission\.requires_full_context, true/);
  assert.match(script, /ar_source_signal_evaluation_samples/);
  assert.match(script, /ar_source_full_context_resolution_outcomes/);
  assert.match(script, /ar_source_incident_links/);
  assert.match(script, /ar_public_problem_evidence_snapshots/);
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /full_context_outcome_persistence_authorized: false/);
  assert.match(script, /formation_persistence_authorized: false/);
  assert.match(script, /incident_mutation_authorized: false/);
  assert.match(script, /public_problem_mutation_authorized: false/);
  assert.match(script, /publication_authorized: false/);
});

test("15.9S uses the existing full-context resolver with bounded network access", async () => {
  const script = await read("scripts/run-exact-csc-full-context-resolution-15-9s.mjs");

  assert.match(script, /resolveSourceAdmissionWithFullContext/);
  assert.match(script, /MAX_NETWORK_REQUESTS = 2/);
  assert.match(script, /ALLOW_PHASE15_9S_EXACT_FULL_CONTEXT/);
  assert.match(script, /OPENAI_API_KEY is required/);
  assert.match(script, /evidence_quote_sha256/);
  assert.match(script, /evidence_quote_grounded/);
  assert.match(script, /provider_request_id/);
  assert.doesNotMatch(script, /insert\(/);
  assert.doesNotMatch(script, /\.rpc\(/);
});

test("15.9S artifact excludes raw source and authority identifiers", async () => {
  const script = await read("scripts/run-exact-csc-full-context-resolution-15-9s.mjs");

  for (const forbidden of [
    "source_signal_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "provider_request_id",
    "incident_id",
    "curator_decision_id",
    "public_problem_id",
  ]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});

test("15.9S closeout removes the temporary live workflow trigger", async () => {
  await assert.rejects(
    read(".github/workflows/source-exact-csc-full-context-15-9s.yml"),
    (error) => error?.code === "ENOENT",
  );
});
