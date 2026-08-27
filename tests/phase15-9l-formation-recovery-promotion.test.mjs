import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceProblemFormationJudgeRequest,
  resolveSourceProblemFormationAudit,
  SourceProblemFormationObserverError,
  SOURCE_PROBLEM_FORMATION_BASE_MAX_OUTPUT_TOKENS,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
  SOURCE_PROBLEM_FORMATION_PROMPT_VERSION,
  SOURCE_PROBLEM_FORMATION_RECOVERY_MAX_OUTPUT_TOKENS,
  SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION,
} from "../lib/sources/source-problem-formation-observer.mjs";

const fullText = "예약 누락 때문에 현지 호텔에서 방이 없다는 안내를 받고 고객센터에 여러 번 연락했습니다.";

function resolvedContext() {
  return {
    status: "resolved",
    title: "예약 누락 피해 후기",
    content_text: fullText,
    content_hash: "a".repeat(64),
    original_char_count: fullText.length,
    truncated: false,
    content_scope: "full_post",
  };
}

function semantic() {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
    evidence_quote: fullText,
    problem_mechanism_proposal: "booking fulfillment failure",
    incident_summary_proposal: "one booking omission episode",
  };
}

test("15.9L promotes only recovery mechanics while preserving semantic prompt authority", () => {
  assert.equal(SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION, "source-problem-formation-observer-v0.2");
  assert.equal(SOURCE_PROBLEM_FORMATION_PROMPT_VERSION, "source-problem-formation-semantic-v0.1");
  assert.equal(SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION, "source-problem-formation-provider-recovery-v0.1");
  assert.equal(SOURCE_PROBLEM_FORMATION_BASE_MAX_OUTPUT_TOKENS, 1200);
  assert.equal(SOURCE_PROBLEM_FORMATION_RECOVERY_MAX_OUTPUT_TOKENS, 2400);
});

test("15.9L base request remains byte-contract equivalent on semantic schema and 1200 budget", () => {
  const base = buildSourceProblemFormationJudgeRequest({
    title: "test",
    fullText,
    sourcePlatform: "external_web",
    model: "test-model",
  });
  const recovery = buildSourceProblemFormationJudgeRequest({
    title: "test",
    fullText,
    sourcePlatform: "external_web",
    model: "test-model",
    providerRecovery: true,
  });

  assert.equal(base.promptVersion, SOURCE_PROBLEM_FORMATION_PROMPT_VERSION);
  assert.equal(base.body.max_output_tokens, 1200);
  assert.equal(base.providerRecovery, false);
  assert.doesNotMatch(base.body.instructions, /Recovery attempt:/);

  assert.equal(recovery.promptVersion, SOURCE_PROBLEM_FORMATION_PROMPT_VERSION);
  assert.equal(recovery.recoveryVersion, SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION);
  assert.equal(recovery.body.max_output_tokens, 2400);
  assert.equal(recovery.providerRecovery, true);
  assert.match(recovery.body.instructions, /prior structured Formation response was incomplete/);

  assert.deepEqual(recovery.body.input, base.body.input);
  assert.deepEqual(recovery.body.text, base.body.text);
  assert.equal(recovery.body.model, base.body.model);
  assert.equal(recovery.body.store, base.body.store);
  assert.equal(
    recovery.body.instructions.replace(/ Recovery attempt:.*$/, ""),
    base.body.instructions,
  );
});

test("15.9L resolver supplies recovery control only after retryable provider-incomplete", async () => {
  const controls = [];
  let calls = 0;
  const result = await resolveSourceProblemFormationAudit({ source_platform: "external_web" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async (_input, control) => {
      controls.push(control);
      calls += 1;
      if (calls === 1) {
        throw new SourceProblemFormationObserverError(
          "source_formation_provider_incomplete",
          "incomplete",
          { retryable: true },
        );
      }
      return semantic();
    },
    maxSemanticAttempts: 9,
  });

  assert.equal(calls, 2, "production recovery must remain one bounded retry even if a caller asks for more");
  assert.deepEqual(controls.map((control) => control.recovery), [false, true]);
  assert.deepEqual(controls.map((control) => control.attempt), [1, 2]);
  assert.equal(result.formation_state, "eligible");
  assert.equal(result.recovery.version, SOURCE_PROBLEM_FORMATION_RECOVERY_VERSION);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.recovered, true);
  assert.equal(result.recovery.attempt_count, 2);
  assert.equal(result.recovery.trigger_reason_code, "source_formation_provider_incomplete");
  assert.equal(result.recovery.base_max_output_tokens, 1200);
  assert.equal(result.recovery.recovery_max_output_tokens, 2400);
});

test("15.9L does not promote retries for timeout, network, invalid JSON, or invalid quote errors", async () => {
  const cases = [
    ["source_formation_provider_timeout", true],
    ["source_formation_provider_network_error", true],
    ["source_formation_provider_invalid_json", false],
    ["source_formation_invalid_evidence_quote", false],
  ];

  for (const [code, retryable] of cases) {
    let calls = 0;
    const result = await resolveSourceProblemFormationAudit({ source_platform: "external_web" }, {
      fetchContext: async () => resolvedContext(),
      judgeContext: async () => {
        calls += 1;
        throw new SourceProblemFormationObserverError(code, code, { retryable });
      },
      maxSemanticAttempts: 2,
    });
    assert.equal(calls, 1, `${code} must not receive Formation semantic recovery`);
    assert.equal(result.resolved, false);
    assert.deepEqual(result.reason_codes, [code]);
    assert.equal(result.recovery.attempted, false);
    assert.equal(result.recovery.recovery_max_output_tokens, null);
  }
});

test("15.9L a second provider-incomplete remains unresolved and never receives a third call", async () => {
  let calls = 0;
  const result = await resolveSourceProblemFormationAudit({ source_platform: "external_web" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async () => {
      calls += 1;
      throw new SourceProblemFormationObserverError(
        "source_formation_provider_incomplete",
        "incomplete",
        { retryable: true },
      );
    },
    maxSemanticAttempts: 99,
  });

  assert.equal(calls, 2);
  assert.equal(result.resolved, false);
  assert.deepEqual(result.reason_codes, ["source_formation_provider_incomplete"]);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.recovered, false);
  assert.equal(result.recovery.attempt_count, 2);
  assert.equal(result.recovery.recovery_max_output_tokens, 2400);
});
