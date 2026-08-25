import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SourceFullContextResolutionError,
  buildSourceFullContextJudgeRequest,
  resolveFullContextSemantic,
} from "../lib/sources/source-full-context-resolution.mjs";
import {
  SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_MAX_ATTEMPTS,
  SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER,
  SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION,
  createQuoteIsolationFetch,
  isQuoteIsolationEligible,
  resolveSourceAdmissionWithFullContextQuoteIsolation,
  runQuoteIsolationJudgeWithRecovery,
} from "../lib/sources/source-full-context-quote-isolation.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function reviewSignal() {
  return {
    id: "quote-test-signal",
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/quote-test",
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

function candidateSemantic(evidenceQuote = null) {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: evidenceQuote,
  };
}

test("15.8H is separately versioned and allows only one quote-isolation retry", () => {
  assert.equal(SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_VERSION, "source-full-context-quote-isolation-v0.1");
  assert.equal(SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_MAX_ATTEMPTS, 2);
  assert.equal(SOURCE_FULL_CONTEXT_QUOTE_ISOLATION_TRIGGER, "source_full_context_invalid_evidence_quote");
});

test("only invalid Admission evidence quote triggers quote isolation", () => {
  assert.equal(isQuoteIsolationEligible(new SourceFullContextResolutionError(
    "source_full_context_invalid_evidence_quote",
    "invalid quote",
  )), true);
  assert.equal(isQuoteIsolationEligible(new SourceFullContextResolutionError(
    "source_full_context_provider_incomplete",
    "incomplete",
  )), false);
  assert.equal(isQuoteIsolationEligible(new Error("unknown")), false);
});

test("quote-isolation fetch changes only evidence_quote schema authority and appends an explicit null instruction", async () => {
  const base = buildSourceFullContextJudgeRequest({
    title: "제목",
    fullText: "원문",
    sourcePlatform: "naver_blog",
    model: "test-model",
  }).body;
  let captured = null;
  const isolationFetch = createQuoteIsolationFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true };
  });

  await isolationFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(base),
  });

  assert.equal(captured.store, false);
  assert.equal(captured.model, base.model);
  assert.equal(captured.max_output_tokens, base.max_output_tokens);
  assert.equal(captured.text.format.type, "json_schema");
  assert.equal(captured.text.format.strict, true);
  assert.deepEqual(captured.text.format.schema.required, base.text.format.schema.required);

  for (const [key, schema] of Object.entries(base.text.format.schema.properties)) {
    if (key === "evidence_quote") continue;
    assert.deepEqual(captured.text.format.schema.properties[key], schema);
  }
  assert.deepEqual(captured.text.format.schema.properties.evidence_quote, {
    type: "null",
    description: "Admission classification-only retry: evidence quote is intentionally omitted and carries no provenance authority.",
  });
  assert.match(captured.instructions, /Set evidence_quote to null exactly/);
  assert.match(captured.instructions, /grants no Formation evidence authority/);
});

test("Admission decision mapping is quote-independent for otherwise identical semantics", () => {
  const exactQuote = "서비스 접수 이후 처리가 계속 지연";
  const withQuote = resolveFullContextSemantic(candidateSemantic(exactQuote));
  const withoutQuote = resolveFullContextSemantic(candidateSemantic(null));
  assert.deepEqual(withoutQuote, withQuote);
  assert.equal(withoutQuote.decision, "candidate");
});

test("invalid quote receives exactly one quote-null retry and can resolve", async () => {
  let calls = 0;
  const judged = await runQuoteIsolationJudgeWithRecovery(async (_input, control) => {
    calls += 1;
    if (calls === 1) {
      throw new SourceFullContextResolutionError(
        "source_full_context_invalid_evidence_quote",
        "quote mismatch",
      );
    }
    assert.equal(control.attempt, 2);
    assert.equal(control.quoteIsolation, true);
    return candidateSemantic(null);
  }, { fullText: "x" });

  assert.equal(calls, 2);
  assert.equal(judged.error, null);
  assert.equal(judged.isolation.attempted, true);
  assert.equal(judged.isolation.recovered, true);
  assert.equal(judged.isolation.attempt_count, 2);
});

test("non-quote technical failures do not acquire a new retry path", async () => {
  let calls = 0;
  const judged = await runQuoteIsolationJudgeWithRecovery(async () => {
    calls += 1;
    throw new SourceFullContextResolutionError(
      "source_full_context_provider_incomplete",
      "incomplete",
      { retryable: true },
    );
  }, { fullText: "x" });

  assert.equal(calls, 1);
  assert.ok(judged.error);
  assert.equal(judged.isolation.attempted, false);
});

test("quote-isolation resolver fetches source context once and never grants Formation quote authority", async () => {
  let fetchCalls = 0;
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContextQuoteIsolation(reviewSignal(), {
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
      assert.equal(control.quoteIsolation, true);
      return candidateSemantic(null);
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(judgeCalls, 2);
  assert.equal(result.status, "resolved");
  assert.equal(result.decision, "candidate");
  assert.equal(result.semantic.evidence_quote, null);
  assert.equal(result.formation_quote_authority, "not_granted");
  assert.equal(result.quote_isolation.recovered, true);
});

test("15.8H remains isolated from the separate Formation provenance authority", async () => {
  const [isolation, formation, base] = await Promise.all([
    read("lib/sources/source-full-context-quote-isolation.mjs"),
    read("lib/sources/source-problem-formation.mjs"),
    read("lib/sources/source-full-context-resolution.mjs"),
  ]);
  assert.doesNotMatch(isolation, /from "\.\/source-problem-formation\.mjs"/);
  assert.match(formation, /evidence_quote/);
  assert.match(formation, /fullText\.includes\(evidenceQuote\)/);
  assert.match(base, /evidence_quote must be null or the shortest exact contiguous excerpt/);
  assert.doesNotMatch(base, /source-full-context-quote-isolation/);
});
