import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  determinePhase15_9HConclusion,
  PHASE15_9H_BASELINE_UNRESOLVED_ORDINALS,
  PHASE15_9H_MAX_MODEL_CALLS,
  PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES,
  PHASE15_9H_TARGET_COUNT,
  selectPhase15_9HTargets,
  summarizePhase15_9H,
} from "../lib/sources/phase15-9h-provider-incomplete-recovery.mjs";
import { runSourceFullContextJudgeWithRecovery } from "../lib/sources/source-full-context-recovery.mjs";
import { SourceFullContextResolutionError } from "../lib/sources/source-full-context-resolution.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9H freezes only the eight unresolved Phase 15.9G ordinals", () => {
  assert.deepEqual(PHASE15_9H_BASELINE_UNRESOLVED_ORDINALS, [1, 4, 5, 7, 8, 9, 10, 16]);
  assert.equal(PHASE15_9H_TARGET_COUNT, 8);
  assert.equal(PHASE15_9H_MAX_MODEL_CALLS, 16);
  assert.deepEqual(PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES, ["source_full_context_provider_incomplete"]);

  const sample = Array.from({ length: 16 }, (_, index) => ({ marker: index + 1 }));
  const selected = selectPhase15_9HTargets(sample);
  assert.deepEqual(selected.map((item) => item.marker), [1, 4, 5, 7, 8, 9, 10, 16]);
  assert.deepEqual(selected.map((item) => item.baseline_ordinal), [1, 4, 5, 7, 8, 9, 10, 16]);
  assert.throws(() => selectPhase15_9HTargets(sample.slice(0, 15)), /exact 16-Source/);
});

test("provider incomplete may receive exactly one bounded recovery attempt", async () => {
  let calls = 0;
  const judged = await runSourceFullContextJudgeWithRecovery(async () => {
    calls += 1;
    if (calls === 1) {
      throw new SourceFullContextResolutionError(
        "source_full_context_provider_incomplete",
        "incomplete",
        { retryable: true },
      );
    }
    return { problem_claim: "no" };
  }, { fullText: "body" }, { eligibleReasonCodes: PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES });

  assert.equal(calls, 2);
  assert.equal(judged.error, null);
  assert.equal(judged.recovery.attempted, true);
  assert.equal(judged.recovery.recovered, true);
  assert.equal(judged.recovery.attempt_count, 2);
  assert.equal(judged.recovery.trigger_reason_code, "source_full_context_provider_incomplete");
});

test("invalid evidence quote remains unavailable without retry in 15.9H", async () => {
  let calls = 0;
  const judged = await runSourceFullContextJudgeWithRecovery(async () => {
    calls += 1;
    throw new SourceFullContextResolutionError(
      "source_full_context_invalid_evidence_quote",
      "invalid quote",
    );
  }, { fullText: "body" }, { eligibleReasonCodes: PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES });

  assert.equal(calls, 1);
  assert.equal(judged.semantic, null);
  assert.equal(judged.error.code, "source_full_context_invalid_evidence_quote");
  assert.equal(judged.recovery.attempted, false);
  assert.equal(judged.recovery.trigger_reason_code, null);
  assert.equal(judged.recovery.terminal_reason_code, "source_full_context_invalid_evidence_quote");
});

test("15.9H summary separates fresh resolution, retry recovery, and unresolved results", () => {
  const summary = summarizePhase15_9H([
    { fetch_pair_stable: true, full_context_decision: "reject", decision_reason_codes: ["full_context_informational_content"], recovery: { attempted: false, recovered: false } },
    { fetch_pair_stable: true, full_context_decision: "candidate", decision_reason_codes: ["full_context_first_hand_external_friction"], recovery: { attempted: true, recovered: true, trigger_reason_code: "source_full_context_provider_incomplete" } },
    { fetch_pair_stable: true, full_context_decision: null, decision_reason_codes: ["source_full_context_invalid_evidence_quote"], recovery: { attempted: false, recovered: false, terminal_reason_code: "source_full_context_invalid_evidence_quote" } },
    { fetch_pair_stable: false, full_context_decision: null, decision_reason_codes: ["full_context_pair_changed"], recovery: { attempted: false, recovered: false, terminal_reason_code: "full_context_pair_changed" } },
  ]);

  assert.equal(summary.fresh_first_attempt_resolved, 1);
  assert.equal(summary.provider_recovery_attempted, 1);
  assert.equal(summary.provider_recovered_after_retry, 1);
  assert.equal(summary.provider_recovery_exhausted, 0);
  assert.equal(summary.quote_recovery_attempted, 0);
  assert.equal(summary.policy_consistent, 1);
  assert.equal(summary.false_negative_confirmed, 1);
  assert.equal(summary.unavailable, 2);
  assert.equal(determinePhase15_9HConclusion(summary), "source_admission_false_negative_detected");
});

test("15.9H runner preserves external origin, read-only bounds, and provider-only scope", async () => {
  const script = await read("scripts/run-provider-incomplete-recovery-15-9h.mjs");
  assert.match(script, /blindOverlap.*0/);
  assert.match(script, /sourcePlatform: record\.origin\.kind/);
  assert.match(script, /eligibleReasonCodes: PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES/);
  assert.match(script, /quote_recovery_attempted, 0/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /source_admission_recovery_authorized: false/);
  assert.match(script, /provider_recovery_product_activation: false/);
  assert.match(script, /assert\.deepEqual\(after, before/);

  // Guard the Supabase write surface specifically. Generic `.update(` is not a
  // valid mutation detector because Node's crypto hash API legitimately uses it.
  assert.doesNotMatch(script, /\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(script, /\bclient\s*\.rpc\(/);
});
