import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9T freezes the exact Phase 15.9S Source and context authority", async () => {
  const script = await read("scripts/run-exact-csc-outcome-persistence-15-9t.mjs");

  assert.match(script, /afe8baf0624f44b58101544e211aba5b5243e507a355f49b30ffdeb05a7c0be5/);
  assert.match(script, /b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c/);
  assert.match(script, /db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4/);
  assert.match(script, /751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540/);
  assert.match(script, /EXPECTED_CONTEXT_CHAR_COUNT = 3035/);
  assert.match(script, /EXPECTED_EXTRACTION_SCOPE = "naver_post_body"/);
  assert.match(script, /159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9/);
  assert.match(script, /EXPECTED_EVIDENCE_QUOTE_CHAR_COUNT = 44/);
  assert.match(script, /\.eq\("external_content_id", TARGET_SOURCE_IDENTITY_SHA256\)/);
  assert.match(script, /\.eq\("content_hash", TARGET_SOURCE_CONTENT_SHA256\)/);
  assert.match(script, /data\?\.length, 1/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9T freezes Phase 15.9S semantics and performs zero model calls", async () => {
  const script = await read("scripts/run-exact-csc-outcome-persistence-15-9t.mjs");
  const workflow = await read(".github/workflows/source-exact-csc-outcome-persistence-15-9t.yml");

  assert.match(script, /problem_claim: "yes"/);
  assert.match(script, /experience_actor: "self"/);
  assert.match(script, /friction_cause: "external_service_or_product"/);
  assert.match(script, /friction_specificity: "concrete"/);
  assert.match(script, /pain_centrality: "central"/);
  assert.match(script, /content_kind: "organic"/);
  assert.match(script, /resolveFullContextSemantic\(FROZEN_SEMANTIC\)/);
  assert.match(script, /model_calls: 0/);
  assert.doesNotMatch(script, /resolveSourceAdmissionWithFullContext/);
  assert.doesNotMatch(script, /judgeSourceFullContextSemantics/);
  assert.doesNotMatch(script, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});

test("15.9T re-fetches one full post and appends exactly one durable outcome", async () => {
  const script = await read("scripts/run-exact-csc-outcome-persistence-15-9t.mjs");

  assert.match(script, /fetchSourceFullContext/);
  assert.match(script, /MAX_NETWORK_REQUESTS = 1/);
  assert.match(script, /ALLOW_PHASE15_9T_EXACT_OUTCOME_PERSISTENCE/);
  assert.match(script, /buildSourceFullContextOutcomeRow/);
  assert.match(script, /persistSourceFullContextOutcomeRows/);
  assert.match(script, /rows: \[row\]/);
  assert.match(script, /expectedCount: 1/);
  assert.match(script, /outcomeTotalAfter, outcomeTotalBefore \+ 1/);
  assert.match(script, /pre-existing durable full-context outcome for the target Source/i);
  assert.match(script, /live rerun is forbidden/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.rpc\(/);
});

test("15.9T preserves Formation, Incident and Public authority boundaries", async () => {
  const script = await read("scripts/run-exact-csc-outcome-persistence-15-9t.mjs");

  assert.match(script, /ar_source_formation_assessments/);
  assert.match(script, /ar_source_incidents/);
  assert.match(script, /ar_source_incident_links/);
  assert.match(script, /ar_source_incident_curator_decisions/);
  assert.match(script, /ar_source_incident_decision_executions/);
  assert.match(script, /ar_public_problems/);
  assert.match(script, /ar_public_problem_evidence_snapshots/);
  assert.match(script, /ar_public_problem_feed/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.match(script, /formation_persistence_authorized: false/);
  assert.match(script, /incident_mutation_authorized: false/);
  assert.match(script, /source_incident_link_authorized: false/);
  assert.match(script, /public_problem_mutation_authorized: false/);
  assert.match(script, /public_evidence_persistence_authorized: false/);
  assert.match(script, /publication_authorized: false/);
});

test("15.9T artifact excludes raw source and authority identifiers", async () => {
  const script = await read("scripts/run-exact-csc-outcome-persistence-15-9t.mjs");

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
  assert.match(script, /full_source_body_persisted: false/);
  assert.match(script, /evidence_quote_persisted: false/);
});

test("15.9T temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-exact-csc-outcome-persistence-15-9t.yml");

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9T_EXACT_OUTCOME_PERSISTENCE: "true"/);
  assert.match(workflow, /run-exact-csc-outcome-persistence-15-9t\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});
