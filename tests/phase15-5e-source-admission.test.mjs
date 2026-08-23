import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import { classifySourceAdmission, extractSourceTitle } from "../lib/sources/source-admission.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(title, description = "") {
  return {
    source_platform: "naver_blog",
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    source_metadata: { provider_title: title, provider_description: description },
    is_quote_post: null,
  };
}

test("NAVER source admission is title-first and snippet cannot promote incidental pain", () => {
  const dailyPost = naverSignal(
    "so what? we hot we young",
    "피규어충동구매햇는데환불안됨 하..나 연금복권 다섯장 샀는데 다 낙첨이야",
  );
  const result = classifySourceAdmission(dailyPost);
  assert.equal(result.decision, "review");
  assert.equal(result.requires_full_context, true);
  assert.ok(result.reason_codes.includes("title_not_complaint_central"));
});

test("information/guide framing hard rejects even when snippet contains first-hand friction", () => {
  const signal = naverSignal(
    "카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요",
    "저도 일시적인 오류 때문에 로그인 안 될 때가 있었어요.",
  );
  assert.equal(classifySourceAdmission(signal).decision, "reject");
  const prefilter = runDeterministicComplaintPrefilter(signal);
  assert.equal(prefilter.decision, "reject");
  assert.ok(prefilter.reason_codes.includes("source_title_information_or_guide"));
});

test("positive service/product review framing is not a complaint source", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "하수구청소 맡길 일이 생겨서 간 안산 동네방네, 하수구막힘 처리 과정이 깔끔했어요",
    "점점 냄새가 진해지고 변기까지 답답한 느낌이라 업체를 찾았습니다.",
  )).decision, "reject");

  assert.equal(classifySourceAdmission(naverSignal(
    "용산 피프틴커피 배달 후기 ☕ 1인 가구도 부담 없는 최소주문금액!",
    "제가 배달 주문할 때 제일 불편하게 느끼는 게 바로 최소주문금액 맞추기",
  )).decision, "reject");
});

test("health how-to title is information, not complaint-central source", () => {
  const result = classifySourceAdmission(naverSignal(
    "가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때",
    "내가 예전에 감기 걸렸을 때도 가래 때문에 고생한 적 있는데",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("title_information_or_guide"));
});

test("neutral refund review stays context-review while explicit failure title becomes candidate", () => {
  const ambiguous = classifySourceAdmission(naverSignal(
    "여기어때 오키나와 숙소 태풍 결항 환불 후기",
    "무사히 환불 끝냈으니 내년 여행을 노려봐야겠다",
  ));
  assert.equal(ambiguous.decision, "review");
  assert.equal(ambiguous.requires_full_context, true);

  const explicit = classifySourceAdmission(naverSignal(
    "로마 숙소 아고다 고객센터 환불 불가 썰",
    "호텔 측 답변은 환불 불가였습니다.",
  ));
  assert.equal(explicit.decision, "candidate");
  assert.ok(explicit.reason_codes.includes("title_explicit_complaint"));
});

test("provider title is authoritative over retrieval description", () => {
  const signal = naverSignal("고객센터 전화번호 총정리", "환불이 안 돼서 너무 화가 났다");
  assert.equal(extractSourceTitle(signal), "고객센터 전화번호 총정리");
  assert.equal(classifySourceAdmission(signal).decision, "reject");
});

test("Source Lab makes no-LLM admission active and paid Silver requires explicit opt-in", async () => {
  const [page, runner] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("scripts/run-silver-semantic-pipeline.mjs"),
  ]);
  assert.match(page, /No-LLM Source Admission/);
  assert.match(page, /snippet 한 문장만으로 complaint candidate를 만들지 않습니다/);
  assert.match(page, /AI Silver는 active admission path가 아닙니다/);
  assert.doesNotMatch(page, /npm run classify:silver:live/);
  assert.match(runner, /ALLOW_PAID_SILVER_LLM/);
  assert.match(runner, /disabled by default/);
});

test("production deployment remains disabled", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  assert.equal(vercel.git.deploymentEnabled, false);
});
