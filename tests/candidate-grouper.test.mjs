import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateProviderError,
  buildOpenAIGroupingRequest,
  groupProblemCandidates,
  normalizeGroupedCandidates,
} from "../lib/candidates/openai-grouper.mjs";

const evidences = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    original_text: "배송이 너무 느립니다.",
    summary_ko: "배송 지연",
    pain_type: "reliability",
    target_user: "구매자",
    situation: "배송 대기",
    sentiment_level: "negative",
    intensity_level: "high",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    original_text: "배송 조회가 며칠째 갱신되지 않습니다.",
    summary_ko: "배송 추적 정보 미갱신",
    pain_type: "reliability",
    target_user: "구매자",
    situation: "배송 조회",
    sentiment_level: "negative",
    intensity_level: "medium",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    original_text: "환불 절차가 너무 복잡합니다.",
    summary_ko: "복잡한 환불 절차",
    pain_type: "workflow",
    target_user: "구매자",
    situation: "환불 신청",
    sentiment_level: "negative",
    intensity_level: "high",
  },
];

function providerPayload(output, overrides = {}) {
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    headers: { get: () => "req_candidate_1" },
    json: async () =>
      overrides.body ?? {
        id: "resp_candidate_1",
        status: "completed",
        model: "gpt-5-mini-test",
        output_text: JSON.stringify(output),
        usage: { input_tokens: 120, output_tokens: 80 },
      },
  };
}

const validOutput = {
  candidates: [
    {
      title: "배송 상태를 신뢰하기 어렵다",
      summary: "배송 지연과 추적 정보 미갱신으로 구매자가 현재 상태를 알기 어렵다.",
      target_user: "온라인 구매자",
      situation: "배송을 기다리고 조회할 때",
      evidence_refs: ["E001", "E002"],
      intensity_level: "high",
      repeat_pattern_level: "strong",
      clarity_level: "clear",
    },
    {
      title: "환불 절차가 복잡하다",
      summary: "환불 시작 단계와 절차가 복잡해 사용자가 진행하기 어렵다.",
      target_user: "환불을 요청하는 구매자",
      situation: "환불 신청 시",
      evidence_refs: ["E003"],
      intensity_level: "high",
      repeat_pattern_level: "weak",
      clarity_level: "clear",
    },
  ],
};

test("grouping request uses strict structured output and treats Evidence as data", () => {
  const refs = evidences.map((evidence, index) => ({
    ref: `E${String(index + 1).padStart(3, "0")}`,
    ...evidence,
  }));
  const request = buildOpenAIGroupingRequest({
    evidenceRefs: refs,
    model: "gpt-5-mini-test",
    safetyIdentifier: "ar_test",
  });

  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /untrusted data/);
  assert.match(request.instructions, /exactly once/);
  assert.doesNotMatch(JSON.stringify(request), /11111111-1111/);
  assert.match(JSON.stringify(request), /E001/);
});

test("provider result maps opaque refs to Evidence ids and preserves a full partition", async () => {
  let requestBody;
  const output = await groupProblemCandidates({
    evidences,
    requestId: "attempt-1",
    apiKey: "test-key",
    model: "gpt-5-mini-test",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return providerPayload(validOutput);
    },
  });

  assert.equal(requestBody.store, false);
  assert.equal(output.candidates.length, 2);
  assert.deepEqual(output.candidates[0].evidence_ids, [evidences[0].id, evidences[1].id]);
  assert.deepEqual(output.candidates[1].evidence_ids, [evidences[2].id]);
  assert.deepEqual(output.usage, { inputTokens: 120, outputTokens: 80 });
});

test("normalization rejects missing, duplicate and unknown Evidence refs", () => {
  const refs = evidences.map((evidence, index) => ({
    ref: `E${String(index + 1).padStart(3, "0")}`,
    ...evidence,
  }));

  const missing = structuredClone(validOutput);
  missing.candidates[1].evidence_refs = [];
  assert.throws(() => normalizeGroupedCandidates(missing, refs), /must not be empty/);

  const duplicate = structuredClone(validOutput);
  duplicate.candidates[1].evidence_refs = ["E002", "E003"];
  assert.throws(() => normalizeGroupedCandidates(duplicate, refs), /multiple Candidates/);

  const unknown = structuredClone(validOutput);
  unknown.candidates[1].evidence_refs = ["E999"];
  assert.throws(() => normalizeGroupedCandidates(unknown, refs), /unknown Evidence/);

  const omitted = structuredClone(validOutput);
  omitted.candidates = [omitted.candidates[0]];
  assert.throws(() => normalizeGroupedCandidates(omitted, refs), /exactly once/);
});

test("provider HTTP and timeout failures are classified", async () => {
  await assert.rejects(
    () =>
      groupProblemCandidates({
        evidences,
        requestId: "attempt-2",
        apiKey: "bad-key",
        model: "gpt-5-mini-test",
        fetchImpl: async () =>
          providerPayload(null, {
            ok: false,
            status: 401,
            body: { error: { message: "bad key" } },
          }),
      }),
    (error) => error instanceof CandidateProviderError && error.code === "provider_auth_error",
  );

  await assert.rejects(
    () =>
      groupProblemCandidates({
        evidences,
        requestId: "attempt-3",
        apiKey: "test-key",
        model: "gpt-5-mini-test",
        timeoutMs: 1,
        fetchImpl: async (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      }),
    (error) => error instanceof CandidateProviderError && error.code === "provider_timeout",
  );
});
