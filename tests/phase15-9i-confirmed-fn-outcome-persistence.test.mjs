import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_9IFrozenCandidateResult,
  PHASE15_9I_BATCH_VERSION,
  PHASE15_9I_CANDIDATE_AUTHORITY,
  PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9I_MODEL_CALLS,
  PHASE15_9I_SAMPLE_FINGERPRINT,
  PHASE15_9I_TARGET_COUNT,
  PHASE15_9I_TARGET_ORDINALS,
  selectPhase15_9ICandidateTargets,
} from "../lib/sources/phase15-9i-confirmed-fn-outcome-persistence.mjs";
import { buildSourceFullContextOutcomeRow } from "../lib/sources/source-full-context-outcome-persistence.mjs";
import { resolveFullContextSemantic } from "../lib/sources/source-full-context-resolution.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9I freezes exactly the three Phase 15.9H confirmed false-negative ordinals", () => {
  assert.deepEqual(PHASE15_9I_TARGET_ORDINALS, [4, 9, 16]);
  assert.equal(PHASE15_9I_TARGET_COUNT, 3);
  assert.equal(PHASE15_9I_MODEL_CALLS, 0);
  assert.equal(PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS, 24);
  assert.equal(PHASE15_9I_SAMPLE_FINGERPRINT, "2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e");
  assert.equal(PHASE15_9I_BATCH_VERSION, "phase15.9i-confirmed-false-negative-candidates-v0.1");

  const sample = Array.from({ length: 16 }, (_, index) => ({ marker: index + 1 }));
  const targets = selectPhase15_9ICandidateTargets(sample);
  assert.deepEqual(targets.map((item) => item.marker), [4, 9, 16]);
  assert.deepEqual(targets.map((item) => item.baseline_ordinal), [4, 9, 16]);
  assert.throws(() => selectPhase15_9ICandidateTargets(sample.slice(0, 15)), /exact 16-Source/);
});

test("all frozen H semantic facts still resolve to Candidate under the reused resolver", () => {
  for (const ordinal of PHASE15_9I_TARGET_ORDINALS) {
    const authority = PHASE15_9I_CANDIDATE_AUTHORITY[ordinal];
    const final = resolveFullContextSemantic(authority.semantic);
    assert.equal(final.decision, "candidate");
    assert.equal(final.resolved, true);
    assert.deepEqual(final.reason_codes, ["full_context_first_hand_external_friction"]);
  }
});

test("15.9I frozen result maps safely into existing append-only outcome schema", () => {
  const authority = PHASE15_9I_CANDIDATE_AUTHORITY[4];
  const body = "x".repeat(200);
  const fullContext = {
    status: "resolved",
    content_scope: "full_post",
    content_text: body,
    truncated: false,
  };
  const result = buildPhase15_9IFrozenCandidateResult(authority, fullContext);
  const row = buildSourceFullContextOutcomeRow({
    batchVersion: PHASE15_9I_BATCH_VERSION,
    sourceSignalId: "test-source-id",
    result,
    configuredModel: "gpt-5-mini-2025-08-07",
  });

  assert.equal(row.status, "resolved");
  assert.equal(row.decision, "candidate");
  assert.deepEqual(row.reason_codes, ["full_context_first_hand_external_friction"]);
  assert.equal(row.problem_claim, "yes");
  assert.equal(row.experience_actor, "self");
  assert.equal(row.friction_cause, "external_service_or_product");
  assert.equal(row.friction_specificity, "concrete");
  assert.equal(row.pain_centrality, "central");
  assert.equal(row.content_kind, "organic");
  assert.equal(row.recovery_attempted, true);
  assert.equal(row.recovery_recovered, true);
  assert.equal(row.recovery_attempt_count, 2);
  assert.equal(row.recovery_trigger_reason_code, "source_full_context_provider_incomplete");
  assert.equal("content_text" in row, false);
  assert.equal("canonical_url" in row, false);
  assert.equal("evidence_quote" in row, false);
  assert.equal("provider_request_id" in row, false);
});

test("15.9I runner uses no semantic provider and fails closed before one final bulk insert", async () => {
  const script = await read("scripts/run-confirmed-fn-outcome-persistence-15-9i.mjs");

  assert.match(script, /blindOverlap.*0/);
  assert.match(script, /PHASE15_9I_SAMPLE_FINGERPRINT/);
  assert.match(script, /assertContextMatchesHAuthority/);
  assert.match(script, /first\.content_hash, authority\.context_hash/);
  assert.match(script, /first\.original_char_count, authority\.context_chars/);
  assert.match(script, /first\.extraction_scope, authority\.extraction_scope/);
  assert.match(script, /sha256\(first\.title/);
  assert.match(script, /persistSourceFullContextOutcomeRows/);
  assert.match(script, /expectedCount: PHASE15_9I_TARGET_COUNT/);
  assert.match(script, /outcomeTotalBefore, EXPECTED_OUTCOME_TOTAL_BEFORE/);
  assert.match(script, /outcomeTotalAfter, EXPECTED_OUTCOME_TOTAL_AFTER/);
  assert.match(script, /source_admission_mutation_authorized: false/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /publication_authorized: false/);

  assert.doesNotMatch(script, /judgeSourceFullContextSemantics/);
  assert.doesNotMatch(script, /resolveSourceAdmissionWithFullContextRecovery/);
  assert.doesNotMatch(script, /getSourceFullContextProviderConfig/);
  assert.doesNotMatch(script, /OPENAI_API_KEY/);
  assert.doesNotMatch(script, /\/v1\/responses/);
  assert.doesNotMatch(script, /\.from\([^)]*\)\s*\.(?:update|upsert|delete)\(/);
  assert.doesNotMatch(script, /\bclient\s*\.rpc\(/);
});

test("15.9I workflow has no model secret and remains manual-only on authoritative main after closeout", async () => {
  const workflow = await read(".github/workflows/source-confirmed-fn-outcome-persistence-15-9i.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9I_CONFIRMED_FN_OUTCOME_PERSISTENCE: "true"/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /agent\/phase15-9i-live-execution/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_SOURCE_FULL_CONTEXT_MODEL/);
});
