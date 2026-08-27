import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  comparePhase15_9GFetches,
  determinePhase15_9GConclusion,
  PHASE15_9G_MAX_MODEL_CALLS,
  PHASE15_9G_SAMPLE_SIZE,
  PHASE15_9G_VERSION,
  summarizePhase15_9G,
} from "../lib/sources/phase15-9g-semantic-rejection-diagnostics.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function resolved(hash = "a", chars = 300, scope = "article_element", title = "title") {
  return {
    status: "resolved",
    content_text: "x".repeat(chars),
    content_hash: hash,
    original_char_count: chars,
    extraction_scope: scope,
    title,
    truncated: false,
  };
}

test("15.9G requires two byte-equivalent normalized external contexts before semantic judging", () => {
  assert.equal(PHASE15_9G_VERSION, "phase15.9g-external-semantic-rejection-diagnostics-v0.1");
  assert.equal(PHASE15_9G_SAMPLE_SIZE, 16);
  assert.equal(PHASE15_9G_MAX_MODEL_CALLS, 16);
  assert.deepEqual(comparePhase15_9GFetches(resolved(), resolved()), {
    stable: true,
    reason: "full_context_pair_stable",
    first_status: "resolved",
    second_status: "resolved",
  });
  assert.equal(comparePhase15_9GFetches(resolved("a"), resolved("b")).stable, false);
  assert.equal(comparePhase15_9GFetches(resolved("a", 300), resolved("a", 301)).stable, false);
  assert.equal(comparePhase15_9GFetches(resolved("a", 300, "article_element"), resolved("a", 300, "main_element")).stable, false);
  assert.equal(comparePhase15_9GFetches(resolved("a", 300, "article_element", "A"), resolved("a", 300, "article_element", "B")).stable, false);
  assert.equal(comparePhase15_9GFetches({ status: "unavailable" }, resolved()).reason, "full_context_pair_unavailable");
});

test("15.9G diagnostic summary preserves existing candidate/review/reject interpretation", () => {
  const summary = summarizePhase15_9G([
    { fetch_pair_stable: true, model_call_attempted: true, full_context_decision: "candidate", decision_reason_codes: ["full_context_first_hand_external_friction"] },
    { fetch_pair_stable: true, model_call_attempted: true, full_context_decision: "review", decision_reason_codes: ["full_context_semantic_uncertain"] },
    { fetch_pair_stable: true, model_call_attempted: true, full_context_decision: "reject", decision_reason_codes: ["full_context_informational_content"] },
    { fetch_pair_stable: false, model_call_attempted: false, full_context_decision: null, decision_reason_codes: ["full_context_pair_changed"] },
  ]);
  assert.equal(summary.false_negative_confirmed, 1);
  assert.equal(summary.false_negative_possible, 1);
  assert.equal(summary.policy_consistent, 1);
  assert.equal(summary.unavailable, 1);
  assert.equal(summary.fetch_pair_stable, 3);
  assert.equal(summary.fetch_pair_unstable, 1);
  assert.equal(determinePhase15_9GConclusion(summary), "source_admission_false_negative_detected");
});

test("15.9G runner reuses existing semantic authority and does not mutate governed state", async () => {
  const runner = await read("scripts/run-external-semantic-rejection-diagnostics-15-9g.mjs");
  assert.match(runner, /selectPhase15_9FExternalPilot/);
  assert.match(runner, /getEvaluationSampleIds/);
  assert.ok(
    runner.indexOf("assert.equal(blindOverlap, 0")
      < runner.indexOf("const urlFieldsById = await loadUrlFields(client"),
  );
  assert.match(runner, /comparePhase15_9GFetches/);
  assert.match(runner, /judgeSourceFullContextSemantics/);
  assert.match(runner, /resolveFullContextSemantic/);
  assert.match(runner, /sourcePlatform: record\.origin\.kind/);
  assert.match(runner, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /full_context_outcome_persistence_authorized: false/);
  assert.doesNotMatch(runner, /\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(runner, /\.from\([^)]*\)[\s\S]{0,500}?\.update\(/);
  assert.doesNotMatch(runner, /\.rpc\(/);
  assert.doesNotMatch(runner, /ar_register_source_incident|ar_set_public_problem_status/);
});

test("15.9G artifact contract hashes evidence excerpts instead of exporting them", async () => {
  const runner = await read("scripts/run-external-semantic-rejection-diagnostics-15-9g.mjs");
  assert.match(runner, /evidence_quote_length/);
  assert.match(runner, /evidence_quote_sha256/);
  assert.match(runner, /provider_request_id/);
  assert.doesNotMatch(runner, /semantic:\s*semantic[,}]/);
});
