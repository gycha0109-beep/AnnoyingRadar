import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9L runner verifies production observer v0.2 directly and remains DB read-only", async () => {
  const script = await read("scripts/run-formation-recovery-promotion-15-9l.mjs");
  assert.match(script, /resolveSourceProblemFormationAudit/);
  assert.match(script, /createPhase15_9LObservedProviderFetch/);
  assert.match(script, /assertPhase15_9LProviderAttemptContract/);
  assert.match(script, /PHASE15_9L_EXPECTED_OUTCOME_TOTAL/);
  assert.match(script, /protectedBefore\.full_context_outcomes/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.match(script, /blindOverlap, 0/);
  assert.match(script, /assertNoDownstreamAssignments/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcomeRows/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.rpc\(/);
});

test("15.9L disposable artifact strips raw source and routing identity", async () => {
  const script = await read("scripts/run-formation-recovery-promotion-15-9l.mjs");
  assert.match(script, /evidence_quote_sha256/);
  assert.match(script, /artifact_contains_raw_source_body: false/);
  assert.match(script, /"source_signal_id"/);
  assert.match(script, /"canonical_url"/);
  assert.match(script, /"content_text"/);
  assert.match(script, /"provider_request_id"/);
  assert.match(script, /incident_identity_assigned: false/);
  assert.match(script, /public_evidence_created: false/);
  assert.match(script, /ordinal_4_current_context_replacement: false/);
});

test("15.9L live workflow is bounded to temporary branch plus manual dispatch before closeout", async () => {
  const workflow = await read(".github/workflows/source-formation-recovery-promotion-15-9l.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /agent\/phase15-9l-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9L_FORMATION_RECOVERY_PROMOTION: "true"/);
  assert.match(workflow, /run-formation-recovery-promotion-15-9l\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
});

test("15.9L documentation preserves semantic policy and downstream authority boundaries", async () => {
  const doc = await read("docs/phase15-9l-formation-recovery-promotion.md");
  assert.match(doc, /source-problem-formation-observer-v0\.2/);
  assert.match(doc, /source-problem-formation-semantic-v0\.1/);
  assert.match(doc, /source-problem-formation-provider-recovery-v0\.1/);
  assert.match(doc, /max_output_tokens = 1200/);
  assert.match(doc, /max_output_tokens = 2400/);
  assert.match(doc, /Only retryable `source_formation_provider_incomplete`/);
  assert.match(doc, /deterministic `resolveProblemFormationSemantic\(\)` authority are unchanged/);
  assert.match(doc, /Incident identity or persistence/);
  assert.match(doc, /Public Evidence creation/);
  assert.match(doc, /ordinal 4 current-context replacement/);
});
