import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPhase15_9KBaselineFetch,
  createPhase15_9KRecoveryFetch,
  determinePhase15_9KConclusion,
  PHASE15_9K_BASE_MAX_OUTPUT_TOKENS,
  PHASE15_9K_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9K_MAX_MODEL_CALLS,
  PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS,
  PHASE15_9K_TARGET_COUNT,
  PHASE15_9K_TARGET_ORDINALS,
  runPhase15_9KFormationJudgeWithRecovery,
  summarizePhase15_9K,
} from "../lib/sources/phase15-9k-formation-provider-recovery.mjs";
import { SourceProblemFormationObserverError } from "../lib/sources/source-problem-formation-observer.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("15.9K freezes the two unresolved Formation targets and bounded budgets", () => {
  assert.deepEqual(PHASE15_9K_TARGET_ORDINALS, [9, 16]);
  assert.equal(PHASE15_9K_TARGET_COUNT, 2);
  assert.equal(PHASE15_9K_EXPECTED_OUTCOME_TOTAL, 85);
  assert.equal(PHASE15_9K_MAX_SOURCE_NETWORK_REQUESTS, 16);
  assert.equal(PHASE15_9K_MAX_MODEL_CALLS, 4);
  assert.equal(PHASE15_9K_BASE_MAX_OUTPUT_TOKENS, 1200);
  assert.equal(PHASE15_9K_RECOVERY_MAX_OUTPUT_TOKENS, 2400);
});

test("15.9K baseline fetch preserves the existing request budget and records incomplete metadata", async () => {
  let seenBody = null;
  const metadata = [];
  const fetchImpl = async (_url, init) => {
    seenBody = JSON.parse(init.body);
    return response({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      usage: { output_tokens: 1200, output_tokens_details: { reasoning_tokens: 1190 } },
    });
  };
  const wrapped = createPhase15_9KBaselineFetch(fetchImpl, { onProviderMetadata: (item) => metadata.push(item) });
  await wrapped("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({ max_output_tokens: 1200, instructions: "base" }),
  });
  assert.equal(seenBody.max_output_tokens, 1200);
  assert.equal(metadata.length, 1);
  assert.equal(metadata[0].recovery, false);
  assert.equal(metadata[0].requested_max_output_tokens, 1200);
  assert.equal(metadata[0].provider_status, "incomplete");
  assert.equal(metadata[0].incomplete_reason, "max_output_tokens");
  assert.equal(metadata[0].reasoning_tokens, 1190);
});

test("15.9K recovery fetch changes only bounded output budget plus concise recovery instruction", async () => {
  let seenBody = null;
  const metadata = [];
  const fetchImpl = async (_url, init) => {
    seenBody = JSON.parse(init.body);
    return response({ status: "completed", usage: { output_tokens: 900 } });
  };
  const wrapped = createPhase15_9KRecoveryFetch(fetchImpl, { onProviderMetadata: (item) => metadata.push(item) });
  await wrapped("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({ max_output_tokens: 1200, instructions: "base formation authority" }),
  });
  assert.equal(seenBody.max_output_tokens, 2400);
  assert.match(seenBody.instructions, /base formation authority/);
  assert.match(seenBody.instructions, /prior structured Formation response was incomplete/);
  assert.equal(metadata[0].recovery, true);
  assert.equal(metadata[0].requested_max_output_tokens, 2400);
  assert.equal(metadata[0].provider_status, "completed");
});

test("15.9K retries exactly once only for retryable provider-incomplete", async () => {
  let calls = 0;
  const judge = async (_input, control) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(control.recovery, false);
      throw new SourceProblemFormationObserverError(
        "source_formation_provider_incomplete",
        "incomplete",
        { retryable: true },
      );
    }
    assert.equal(control.recovery, true);
    return { problem_claim: "yes" };
  };
  const result = await runPhase15_9KFormationJudgeWithRecovery(judge, {});
  assert.equal(calls, 2);
  assert.equal(result.error, null);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.recovered, true);
  assert.equal(result.recovery.attempt_count, 2);
  assert.equal(result.recovery.trigger_reason_code, "source_formation_provider_incomplete");
});

test("15.9K never retries invalid evidence quote or other terminal errors", async () => {
  for (const code of ["source_formation_invalid_evidence_quote", "source_formation_provider_invalid_json"]) {
    let calls = 0;
    const judge = async () => {
      calls += 1;
      throw new SourceProblemFormationObserverError(code, code);
    };
    const result = await runPhase15_9KFormationJudgeWithRecovery(judge, {});
    assert.equal(calls, 1);
    assert.equal(result.semantic, null);
    assert.equal(result.recovery.attempted, false);
    assert.equal(result.recovery.attempt_count, 1);
    assert.equal(result.recovery.terminal_reason_code, code);
  }
});

test("15.9K summary distinguishes recovery from persistence and context drift", () => {
  const recovered = summarizePhase15_9K([
    {
      context_integrity_ok: true,
      baseline_resolved: false,
      formation_state: "eligible",
      resolved: true,
      recovery: { attempted: true, recovered: true, terminal_reason_code: null },
      provider_attempts: [{ incomplete_reason: "max_output_tokens" }, { incomplete_reason: null }],
    },
    {
      context_integrity_ok: true,
      baseline_resolved: false,
      formation_state: "review",
      resolved: false,
      recovery: { attempted: true, recovered: false, terminal_reason_code: "source_formation_provider_incomplete" },
      provider_attempts: [{ incomplete_reason: "max_output_tokens" }, { incomplete_reason: "max_output_tokens" }],
    },
  ]);
  assert.equal(recovered.provider_recovered_after_budgeted_retry, 1);
  assert.equal(recovered.provider_recovery_exhausted, 1);
  assert.equal(recovered.incomplete_detail_reason_counts.max_output_tokens, 3);
  assert.equal(determinePhase15_9KConclusion(recovered), "formation_provider_incomplete_recoverable_with_bounded_output_budget");

  const drift = summarizePhase15_9K([
    {
      context_integrity_ok: false,
      baseline_resolved: false,
      formation_state: null,
      resolved: false,
      recovery: { attempted: false, recovered: false, terminal_reason_code: null },
      provider_attempts: [],
    },
  ]);
  assert.equal(determinePhase15_9KConclusion(drift), "formation_provider_reproduction_blocked_by_context_drift");
});

test("15.9K runner is Blind-safe, exact-context-bound, origin-aware, and DB read-only", async () => {
  const script = await read("scripts/run-formation-provider-recovery-15-9k.mjs");
  assert.match(script, /validatePhase15_9JOutcomeAuthority/);
  assert.match(script, /selectPhase15_9KTargets/);
  assert.match(script, /getEvaluationSampleIds/);
  assert.match(script, /blindOverlap.*0/);
  assert.ok(script.indexOf("getEvaluationSampleIds") < script.lastIndexOf("loadTargetSignals"));
  assert.match(script, /inspectPhase15_9JContextIntegrity/);
  assert.match(script, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /sourcePlatform: origin\.kind/);
  assert.match(script, /createPhase15_9KBaselineFetch/);
  assert.match(script, /createPhase15_9KRecoveryFetch/);
  assert.match(script, /source_formation_provider_incomplete/);
  assert.match(script, /invalid_quote_retry_enabled: false/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /incident_identity_assigned: false/);
  assert.match(script, /publication_authority_granted: false/);
  assert.doesNotMatch(script, /\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(script, /\bclient\s*\.rpc\(/);
});

test("15.9K workflow isolates the temporary live trigger and checks out authoritative main", async () => {
  const workflow = await read(".github/workflows/source-formation-provider-recovery-15-9k.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9K_FORMATION_PROVIDER_RECOVERY: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /gpt-5-mini-2025-08-07/);
  assert.match(workflow, /retention-days: 1/);
  const pushBranch = /push:\s*\n\s*branches:\s*\n\s*-\s*([^\s]+)/.exec(workflow)?.[1] ?? null;
  if (pushBranch !== null) assert.equal(pushBranch, "agent/phase15-9k-live-execution");
});
