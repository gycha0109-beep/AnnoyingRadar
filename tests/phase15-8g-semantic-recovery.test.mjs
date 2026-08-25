import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SourceFullContextResolutionError,
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
} from "../lib/sources/source-full-context-resolution.mjs";
import {
  SOURCE_FULL_CONTEXT_RECOVERY_MAX_ATTEMPTS,
  SOURCE_FULL_CONTEXT_RECOVERY_MAX_OUTPUT_TOKENS,
  SOURCE_FULL_CONTEXT_RECOVERY_REASON_CODES,
  SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
  createSourceFullContextRecoveryFetch,
  isSourceFullContextRecoveryEligible,
  resolveSourceAdmissionWithFullContextRecovery,
  runSourceFullContextJudgeWithRecovery,
} from "../lib/sources/source-full-context-recovery.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function reviewSignal() {
  return {
    id: "224384659102",
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/224384659102",
    author_handle: "개인 블로거",
    raw_text: "수리비 87만원?... 어쩔수 없이 새로 구입한 Z폴드8 와이드\n\n2년간 사용한 내 핸드폰이 낙상사고로 중상을 입어 수리상담했고 수리금액은...",
    source_metadata: {
      provider_title: "수리비 87만원?... 어쩔수 없이 새로 구입한 Z폴드8 와이드",
      provider_description: "2년간 사용한 내 핸드폰이 낙상사고로 중상을 입어 수리상담했고 수리금액은...",
    },
  };
}

function fullContext() {
  return {
    status: "resolved",
    title: "원문 제목",
    content_text: "서비스 접수 이후 처리가 계속 지연되어 제가 고객센터에 여러 번 다시 연락했습니다.",
    content_scope: "full_post",
    error_code: null,
  };
}

function candidateSemantic() {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: null,
  };
}

test("15.8G recovery authority is narrowly versioned and bounded to one retry", () => {
  assert.equal(SOURCE_FULL_CONTEXT_RECOVERY_VERSION, "source-full-context-recovery-v0.1");
  assert.equal(SOURCE_FULL_CONTEXT_RECOVERY_MAX_ATTEMPTS, 2);
  assert.equal(SOURCE_FULL_CONTEXT_RECOVERY_MAX_OUTPUT_TOKENS, 1600);
  assert.deepEqual(SOURCE_FULL_CONTEXT_RECOVERY_REASON_CODES, [
    "source_full_context_provider_incomplete",
    "source_full_context_invalid_evidence_quote",
  ]);
});

test("only the two empirically observed technical failures are recovery-eligible", () => {
  for (const code of SOURCE_FULL_CONTEXT_RECOVERY_REASON_CODES) {
    assert.equal(isSourceFullContextRecoveryEligible(new SourceFullContextResolutionError(code, code)), true);
  }
  assert.equal(isSourceFullContextRecoveryEligible(
    new SourceFullContextResolutionError("source_full_context_provider_network_error", "network", { retryable: true }),
  ), false);
  assert.equal(isSourceFullContextRecoveryEligible(new Error("unknown")), false);
});

test("recovery fetch increases the output ceiling without changing store or structured schema", async () => {
  let captured = null;
  const underlying = async (url, init) => {
    captured = { url, init };
    return { ok: true };
  };
  const recoveryFetch = createSourceFullContextRecoveryFetch(underlying, {
    reasonCode: "source_full_context_provider_incomplete",
  });
  await recoveryFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({
      store: false,
      instructions: "base instructions",
      max_output_tokens: 800,
      text: { format: { type: "json_schema", name: "source_full_context_semantic" } },
    }),
  });

  const body = JSON.parse(captured.init.body);
  assert.equal(body.max_output_tokens, 1600);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.match(body.instructions, /previous structured response did not complete/i);
});

test("invalid-quote recovery reinforces exact contiguous quote semantics rather than repairing locally", async () => {
  let captured = null;
  const recoveryFetch = createSourceFullContextRecoveryFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true };
  }, { reasonCode: "source_full_context_invalid_evidence_quote" });

  await recoveryFetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({ instructions: "base", max_output_tokens: 800 }),
  });
  assert.match(captured.instructions, /character-for-character/i);
  assert.match(captured.instructions, /or be null/i);
  assert.equal(captured.max_output_tokens, 1600);
});

test("provider incomplete receives exactly one retry and can recover", async () => {
  let calls = 0;
  const judged = await runSourceFullContextJudgeWithRecovery(async (_input, control) => {
    calls += 1;
    if (calls === 1) {
      throw new SourceFullContextResolutionError(
        "source_full_context_provider_incomplete",
        "incomplete",
        { retryable: true },
      );
    }
    assert.equal(control.attempt, 2);
    assert.equal(control.recoveryReasonCode, "source_full_context_provider_incomplete");
    return candidateSemantic();
  }, { fullText: "x" });

  assert.equal(calls, 2);
  assert.equal(judged.error, null);
  assert.equal(judged.recovery.attempted, true);
  assert.equal(judged.recovery.recovered, true);
  assert.equal(judged.recovery.attempt_count, 2);
});

test("non-eligible provider errors stay unresolved without generic retry expansion", async () => {
  let calls = 0;
  const judged = await runSourceFullContextJudgeWithRecovery(async () => {
    calls += 1;
    throw new SourceFullContextResolutionError(
      "source_full_context_provider_network_error",
      "network",
      { retryable: true },
    );
  }, { fullText: "x" });

  assert.equal(calls, 1);
  assert.ok(judged.error);
  assert.equal(judged.recovery.attempted, false);
  assert.equal(judged.recovery.attempt_count, 1);
});

test("recovery resolver fetches public full context once while allowing two semantic attempts", async () => {
  let fetchCalls = 0;
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContextRecovery(reviewSignal(), {
    fetchContext: async () => {
      fetchCalls += 1;
      return fullContext();
    },
    judgeContext: async (_input, control) => {
      judgeCalls += 1;
      if (judgeCalls === 1) {
        throw new SourceFullContextResolutionError(
          "source_full_context_invalid_evidence_quote",
          "quote mismatch",
        );
      }
      assert.equal(control.recoveryReasonCode, "source_full_context_invalid_evidence_quote");
      return candidateSemantic();
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(judgeCalls, 2);
  assert.equal(result.version, SOURCE_FULL_CONTEXT_RECOVERY_VERSION);
  assert.equal(result.base_resolution_version, SOURCE_FULL_CONTEXT_RESOLUTION_VERSION);
  assert.equal(result.status, "resolved");
  assert.equal(result.decision, "candidate");
  assert.equal(result.recovery.recovered, true);
});

test("semantic uncertainty is not treated as a technical recovery failure", async () => {
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContextRecovery(reviewSignal(), {
    fetchContext: async () => fullContext(),
    judgeContext: async () => {
      judgeCalls += 1;
      return {
        problem_claim: "unclear",
        experience_actor: "unknown",
        friction_cause: "unknown",
        friction_specificity: "unknown",
        pain_centrality: "unclear",
        content_kind: "unknown",
        evidence_quote: null,
      };
    },
  });

  assert.equal(judgeCalls, 1);
  assert.equal(result.status, "unresolved");
  assert.equal(result.decision, "review");
  assert.equal(result.recovery.attempted, false);
  assert.deepEqual(result.reason_codes, ["full_context_semantic_uncertain"]);
});

test("15.8G recovery lane reuses the existing semantic decision authority and has no DB surface", async () => {
  const recovery = await read("lib/sources/source-full-context-recovery.mjs");
  assert.match(recovery, /resolveFullContextSemantic/);
  assert.match(recovery, /classifySourceAdmission/);
  assert.match(recovery, /fetchSourceFullContext/);
  assert.doesNotMatch(recovery, /createServiceClient|supabase|\.(?:insert|upsert|delete)\s*\(/i);
});
