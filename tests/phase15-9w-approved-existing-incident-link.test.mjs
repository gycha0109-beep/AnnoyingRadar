import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9W binds exact recovered Formation and exact approved Incident identity", async () => {
  const script = await read("scripts/run-approved-existing-incident-link-15-9w.mjs");
  assert.match(script, /b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c/);
  assert.match(script, /db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4/);
  assert.match(script, /phase15\.9v-exact-csc-evidence-grounding-recovery-v0\.1/);
  assert.match(script, /751cf7c75b608ec3ae28c7abce7f10bd60521cc8d985a27981b0c7f85e364540/);
  assert.match(script, /159d475f746d30cb9052b24d0354007ab11206ad0cc181e56c0fd675196a5fb9/);
  assert.match(script, /carrier_csc_feature_restriction_case/);
  assert.match(script, /통신사 CSC 변경 후 전용 기능 제한 사례/);
  assert.match(script, /incidentAction: "reuse_existing"/);
  assert.doesNotMatch(script, /incidentAction: "create_new"/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9W records durable curator authority before exact decision execution", async () => {
  const script = await read("scripts/run-approved-existing-incident-link-15-9w.mjs");
  assert.match(script, /recordCuratorIncidentDecision/);
  assert.match(script, /loadDecisionReadback/);
  assert.match(script, /executeApprovedIncidentDecision/);
  assert.match(script, /decisionId: decision\.decision_id/);
  assert.match(script, /loadExecutionReadback/);
  assert.match(script, /durable decision alone must not create the Source→Incident link/);
  assert.match(script, /Human curator explicitly approved linking the exact recovered eligible Formation/);
});

test("15.9W revalidates current source context and forbids models", async () => {
  const script = await read("scripts/run-approved-existing-incident-link-15-9w.mjs");
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 1/);
  assert.match(script, /MAX_MODEL_CALLS = 0/);
  assert.match(script, /fetchImpl: countedFetch/);
  assert.match(script, /sourceNetworkRequests, 1/);
  assert.match(script, /modelCalls, 0/);
  assert.match(script, /reviewed_context/);
  assert.match(script, /reviewed_evidence/);
});

test("15.9W mutation boundary is one decision, one link and one execution with no Public mutation", async () => {
  const script = await read("scripts/run-approved-existing-incident-link-15-9w.mjs");
  assert.match(script, /EXPECTED_INCIDENTS_BEFORE = 7/);
  assert.match(script, /EXPECTED_LINKS_BEFORE = 8/);
  assert.match(script, /EXPECTED_DECISIONS_BEFORE = 1/);
  assert.match(script, /EXPECTED_EXECUTIONS_BEFORE = 1/);
  assert.match(script, /source_incidents: EXPECTED_INCIDENTS_BEFORE,/);
  assert.match(script, /source_incident_links: EXPECTED_LINKS_BEFORE \+ 1/);
  assert.match(script, /curator_decisions: EXPECTED_DECISIONS_BEFORE \+ 1/);
  assert.match(script, /incident_executions: EXPECTED_EXECUTIONS_BEFORE \+ 1/);
  assert.match(script, /public_problems: EXPECTED_PUBLIC_PROBLEMS/);
  assert.match(script, /public_evidence: EXPECTED_PUBLIC_EVIDENCE/);
  assert.match(script, /public_feed: EXPECTED_PUBLIC_FEED/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /public_evidence_persistence_authorized: false/);
  assert.match(script, /publication_authorized: false/);
});

test("15.9W one-shot live workflow stays removed after closeout", async () => {
  const workflowUrl = new URL("../.github/workflows/source-approved-existing-incident-link-15-9w.yml", import.meta.url);
  await assert.rejects(access(workflowUrl));
});

test("15.9W artifact excludes internal identity and raw content fields", async () => {
  const script = await read("scripts/run-approved-existing-incident-link-15-9w.mjs");
  for (const forbidden of [
    "source_signal_id",
    "formation_assessment_id",
    "curator_user_id",
    "decision_id",
    "execution_id",
    "incident_id",
    "canonical_url",
    "raw_text",
    "content_text",
  ]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});
