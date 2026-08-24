import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import {
  buildSourceFullContextJudgeRequest,
  resolveFullContextSemantic,
  resolveSourceAdmissionWithFullContext,
  SOURCE_FULL_CONTEXT_PROMPT_VERSION,
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
} from "../lib/sources/source-full-context-resolution.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(id, title, description) {
  return {
    id,
    source_platform: "naver_blog",
    canonical_url: `https://blog.naver.com/example/${id.replace(/\D/g, "").padEnd(12, "1").slice(0, 12)}`,
    author_handle: "개인 블로거",
    raw_text: `${title}\n\n${description}`,
    source_metadata: {
      provider_title: title,
      provider_description: description,
    },
  };
}

const fullContext = (text = "원문 전체 문맥입니다. 환불 처리가 지연되어 여러 번 연락했습니다.") => ({
  status: "resolved",
  title: "원문 제목",
  content_text: text,
  content_scope: "full_post",
  error_code: null,
});

test("the audited Phase 15.5F development queue stays exactly five REVIEW + full-context items", async () => {
  const fixture = JSON.parse(await read("tests/fixtures/phase15-5f-review-queue.json"));
  assert.equal(fixture.length, 5);
  assert.equal(new Set(fixture.map((item) => item.id)).size, 5);
  for (const item of fixture) {
    const signal = {
      id: item.id,
      source_platform: item.source_platform,
      canonical_url: item.canonical_url,
      author_handle: item.author_handle,
      raw_text: `${item.title}\n\n${item.snippet}`,
      source_metadata: { provider_title: item.title, provider_description: item.snippet },
    };
    const admission = classifySourceAdmission(signal);
    assert.equal(admission.decision, "review", item.title);
    assert.equal(admission.requires_full_context, true, item.title);
  }
});

test("Phase 15.5F resolution contract is versioned and judge observes facts rather than making admission decisions", () => {
  assert.equal(SOURCE_FULL_CONTEXT_RESOLUTION_VERSION, "source-full-context-resolution-v0.1");
  assert.equal(SOURCE_FULL_CONTEXT_PROMPT_VERSION, "source-full-context-semantic-v0.1");
  const request = buildSourceFullContextJudgeRequest({
    title: "환불 후기",
    fullText: "환불 처리가 한 달 지연되었습니다.",
    sourcePlatform: "naver_blog",
    model: "test-model",
  });
  assert.equal(request.body.store, false);
  assert.match(request.body.instructions, /Do not decide CANDIDATE, REVIEW, REJECT/);
  assert.match(request.body.instructions, /full visible post context/);
  assert.match(JSON.stringify(request.body.text.format.schema), /friction_cause/);
  assert.match(JSON.stringify(request.body.text.format.schema), /pain_centrality/);
});

test("full-context semantic mapping accepts concrete first-hand external friction", () => {
  const result = resolveFullContextSemantic({
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: null,
  });
  assert.equal(result.decision, "candidate");
  assert.equal(result.resolved, true);
  assert.deepEqual(result.reason_codes, ["full_context_first_hand_external_friction"]);
});

test("full-context semantic mapping rejects self-caused and incidental cases", () => {
  const common = {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    content_kind: "organic",
    evidence_quote: null,
  };
  const selfCaused = resolveFullContextSemantic({
    ...common,
    friction_cause: "self_caused",
    pain_centrality: "central",
  });
  assert.equal(selfCaused.decision, "reject");
  assert.ok(selfCaused.reason_codes.includes("full_context_self_caused"));

  const incidental = resolveFullContextSemantic({
    ...common,
    friction_cause: "external_service_or_product",
    pain_centrality: "incidental",
  });
  assert.equal(incidental.decision, "reject");
  assert.ok(incidental.reason_codes.includes("full_context_incidental_friction"));
});

test("non-review admission never pays for full-context fetch or semantic judge", async () => {
  const signal = naverSignal(
    "123456789012",
    "로마 숙소 아고다 고객센터 환불 불가 썰",
    "호텔 측 답변은 환불 불가였고 하루 종일 고객센터에 전화했습니다.",
  );
  let fetchCalls = 0;
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContext(signal, {
    fetchContext: async () => { fetchCalls += 1; return fullContext(); },
    judgeContext: async () => { judgeCalls += 1; return {}; },
  });

  assert.notEqual(result.decision, "review");
  assert.equal(result.status, "not_required");
  assert.equal(fetchCalls, 0);
  assert.equal(judgeCalls, 0);
});

test("review admission is resolved only after full context and semantic observation", async () => {
  const signal = naverSignal(
    "224384659102",
    "수리비 87만원?... 어쩔수 없이 새로 구입한 Z폴드8 와이드",
    "2년간 사용한 내 핸드폰이 낙상사고로 중상을 입어 수리상담했고 수리금액은...",
  );
  let fetchCalls = 0;
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContext(signal, {
    fetchContext: async () => {
      fetchCalls += 1;
      return fullContext("제가 휴대폰을 떨어뜨린 뒤 액정이 파손됐고 수리비가 87만원이라 새 제품을 샀습니다.");
    },
    judgeContext: async () => {
      judgeCalls += 1;
      return {
        problem_claim: "yes",
        experience_actor: "self",
        friction_cause: "self_caused",
        friction_specificity: "concrete",
        pain_centrality: "central",
        content_kind: "organic",
        evidence_quote: null,
      };
    },
  });

  assert.equal(result.admission.decision, "review");
  assert.equal(result.admission.requires_full_context, true);
  assert.equal(result.decision, "reject");
  assert.equal(result.status, "resolved");
  assert.equal(fetchCalls, 1);
  assert.equal(judgeCalls, 1);
});

test("fetch failure preserves REVIEW and never manufactures a negative label", async () => {
  const signal = naverSignal(
    "224383955775",
    "[방콕 7박 9일 (7/9)] 짜런생실롬 배달, 어바웃프루츠, 프라야키친, 아....",
    "근데 주문이 계속 취소되는 거임,,, 왜죠? 검색해 보니 구매대행으로 주문했음.",
  );
  let judgeCalls = 0;
  const result = await resolveSourceAdmissionWithFullContext(signal, {
    fetchContext: async () => ({ status: "unavailable", error_code: "full_context_fetch_http_error" }),
    judgeContext: async () => { judgeCalls += 1; return {}; },
  });

  assert.equal(result.admission.decision, "review");
  assert.equal(result.decision, "review");
  assert.equal(result.resolved, false);
  assert.equal(result.status, "unresolved");
  assert.equal(judgeCalls, 0);
  assert.deepEqual(result.reason_codes, ["full_context_fetch_http_error"]);
});

test("uncertain full-context semantics stay REVIEW instead of being force-fit", async () => {
  const signal = naverSignal(
    "224383414011",
    "여기어때 오키나와 숙소 태풍 결항 환불 후기",
    "무사히 환불 끝냈으니 내년 여행을 노려봐야겠다.",
  );
  const result = await resolveSourceAdmissionWithFullContext(signal, {
    fetchContext: async () => fullContext(),
    judgeContext: async () => ({
      problem_claim: "unclear",
      experience_actor: "unknown",
      friction_cause: "unknown",
      friction_specificity: "unknown",
      pain_centrality: "unclear",
      content_kind: "unknown",
      evidence_quote: null,
    }),
  });
  assert.equal(result.decision, "review");
  assert.equal(result.resolved, false);
  assert.ok(result.reason_codes.includes("full_context_semantic_uncertain"));
});

test("Phase 15.5F stays a separate lane: no DB migration/write and no back-import into 15.5E admission policy", async () => {
  const [resolver, fetcher, policy] = await Promise.all([
    read("lib/sources/source-full-context-resolution.mjs"),
    read("lib/sources/source-full-context-fetch.mjs"),
    read("lib/sources/source-admission-policy.mjs"),
  ]);

  assert.doesNotMatch(resolver, /createServiceClient|supabase|\.(?:insert|upsert|delete)\s*\(/i);
  assert.doesNotMatch(fetcher, /createServiceClient|supabase|\.(?:insert|upsert|delete)\s*\(/i);
  assert.doesNotMatch(policy, /source-full-context/);
  assert.match(resolver, /admission\.decision !== "review" \|\| !admission\.requires_full_context/);
});
