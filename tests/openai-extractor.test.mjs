import assert from "node:assert/strict";
import test from "node:test";

import {
  EvidenceProviderError,
  buildOpenAIRequest,
  extractPainEvidence,
  getEvidenceProviderConfig,
  normalizeExtractedEvidence,
} from "../lib/evidence/openai-extractor.mjs";

const rawText = "배송이 너무 느리고 상담원마다 안내 내용이 다릅니다.";
const validEvidence = {
  original_text: rawText,
  summary_ko: "배송 지연과 상담 안내 불일치",
  pain_type: "customer_support",
  target_user: "온라인 쇼핑 고객",
  situation: "배송 문의",
  sentiment_level: "negative",
  intensity_level: "medium",
};

test("OpenAI request uses strict structured output and disables storage", () => {
  const request = buildOpenAIRequest({
    rawText,
    sourceLanguage: "ko",
    model: "gpt-test",
    safetyIdentifier: "ar_test",
  });

  assert.equal(request.store, false);
  assert.equal(request.safety_identifier, "ar_test");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.match(request.input[0].content[0].text, /<raw_input>/);
});

test("provider configuration requires key and explicit model", () => {
  assert.throws(
    () => getEvidenceProviderConfig({ OPENAI_API_KEY: "", OPENAI_EVIDENCE_MODEL: "" }),
    (error) => error instanceof EvidenceProviderError && error.code === "llm_not_configured",
  );
  assert.deepEqual(
    getEvidenceProviderConfig({
      OPENAI_API_KEY: "test-key",
      OPENAI_EVIDENCE_MODEL: "gpt-test",
      OPENAI_EVIDENCE_TIMEOUT_MS: "45000",
    }),
    { apiKey: "test-key", model: "gpt-test", timeoutMs: 45000 },
  );
});

test("normalization accepts exact quotes and rejects fabricated or duplicate quotes", () => {
  assert.deepEqual(normalizeExtractedEvidence({ evidences: [validEvidence] }, rawText), [validEvidence]);

  assert.throws(
    () => normalizeExtractedEvidence({ evidences: [{ ...validEvidence, original_text: "없는 문장" }] }, rawText),
    (error) => error.code === "provider_invalid_output",
  );

  assert.throws(
    () => normalizeExtractedEvidence({ evidences: [validEvidence, validEvidence] }, rawText),
    (error) => error.code === "provider_invalid_output",
  );
});

test("extractPainEvidence parses Responses API output and records request metadata", async () => {
  let capturedRequest;
  const fetchImpl = async (_url, request) => {
    capturedRequest = request;
    return new Response(
      JSON.stringify({
        id: "resp_test",
        status: "completed",
        model: "gpt-test-snapshot",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ evidences: [validEvidence] }),
              },
            ],
          },
        ],
        usage: { input_tokens: 42, output_tokens: 31 },
      }),
      { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_test" } },
    );
  };

  const result = await extractPainEvidence({
    rawText,
    sourceLanguage: "ko",
    requestId: "attempt-test",
    safetyIdentifier: "ar_test",
    apiKey: "secret-test",
    model: "gpt-test",
    fetchImpl,
  });

  assert.deepEqual(result.evidences, [validEvidence]);
  assert.equal(result.model, "gpt-test-snapshot");
  assert.equal(result.providerRequestId, "req_test");
  assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 31 });
  assert.equal(capturedRequest.headers["X-Client-Request-Id"], "attempt-test");
  assert.equal(JSON.parse(capturedRequest.body).store, false);
});

test("provider rate limiting is retryable and sanitized", async () => {
  await assert.rejects(
    () =>
      extractPainEvidence({
        rawText,
        requestId: "attempt-test",
        apiKey: "secret-test",
        model: "gpt-test",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      }),
    (error) =>
      error instanceof EvidenceProviderError &&
      error.code === "provider_rate_limited" &&
      error.retryable === true,
  );
});
