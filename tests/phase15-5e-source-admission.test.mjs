import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import { classifySourceAdmission, extractSourceTitle, SOURCE_ADMISSION_VERSION } from "../lib/sources/source-admission.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(title, description = "") {
  return {
    source_platform: "naver_blog",
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    source_metadata: { provider_title: title, provider_description: description },
    is_quote_post: null,
  };
}

test("Phase 15.5E calibrated admission version is v0.5", () => {
  assert.equal(SOURCE_ADMISSION_VERSION, "source-admission-v0.5");
});

test("incidental complaint phrase in a daily post cannot become a candidate or review", () => {
  const dailyPost = naverSignal(
    "so what? we hot we young",
    "(피규어충동구매햇는데환불안됨) 하..나 연금복권 다섯장 샀는데 다 낙첨이야 너네가 내 로또니까 날 먹여살리도록(간절) 내가 자른 빵 뭐게 아 ㅋ 너무 어렵나 비주얼은 거지 같지만 정말 맛있습니다",
  );
  const result = classifySourceAdmission(dailyPost);
  assert.equal(result.decision, "reject");
  assert.equal(result.requires_full_context, false);
  assert.ok(result.reason_codes.includes("snippet_incidental_complaint_only"));
});

test("information/guide title hard rejects even when snippet contains first-hand friction", () => {
  const signal = naverSignal(
    "카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요",
    "저도 일시적인 오류 때문에 로그인 안 될 때가 있었어요.",
  );
  assert.equal(classifySourceAdmission(signal).decision, "reject");
  const prefilter = runDeterministicComplaintPrefilter(signal);
  assert.equal(prefilter.decision, "reject");
  assert.ok(prefilter.reason_codes.includes("source_title_information_or_guide"));
});

test("conditional guide grammar is not mistaken for a personal complaint narrative", () => {
  const result = classifySourceAdmission(naverSignal(
    "네이버쇼핑 판매자 신고 방법 (환불 거부당했을 때 순서대로 대응하....",
    "✔ 네이버쇼핑에서 환불을 거부당했다면 먼저 Npay 결제내역에서 반품을 신청하고 분쟁조정센터에 접수할 수 있습니다.",
  ));
  assert.equal(result.decision, "reject");
  assert.equal(result.requires_full_context, false);
  assert.ok(result.reason_codes.includes("title_information_or_guide"));
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

test("truncated commercial title is rejected before generic truncation review", () => {
  const result = classifySourceAdmission(naverSignal(
    "하수구청소 맡길 일이 생겨서 간 안산 동네방네, 하수구막힘 처리 ....",
    "처음엔 대충 배수구막힘 정도겠지 싶었는데 점점 냄새가 진해지고 변기까지 답답한 느낌",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("title_commercial_or_seo"));
});

test("health how-to title is information, not complaint-central source", () => {
  const result = classifySourceAdmission(naverSignal(
    "가래 감기 걸렸을 때 어떻게 해야 할까 싶을 때",
    "내가 예전에 감기 걸렸을 때도 가래 때문에 고생한 적 있는데",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("title_information_or_guide"));
});

test("refund review remains context-review while personal refund-failure story is candidate", () => {
  const ambiguous = classifySourceAdmission(naverSignal(
    "여기어때 오키나와 숙소 태풍 결항 환불 후기",
    "출국편 결항 의심될 땐 플랜B를 마련하자. 무사히 환불 끝냈으니 내년 여행을 노려봐야겠다",
  ));
  assert.equal(ambiguous.decision, "review");
  assert.equal(ambiguous.requires_full_context, true);

  const explicit = classifySourceAdmission(naverSignal(
    "로마 숙소 아고다 고객센터 환불 불가 썰",
    "호텔 측 답변은 환불 불가였습니다.",
  ));
  assert.equal(explicit.decision, "candidate");
  assert.ok(explicit.reason_codes.includes("title_explicit_personal_complaint"));
});

test("negative recommendation is not mistaken for positive recommendation", () => {
  const result = classifySourceAdmission(naverSignal(
    "카카오 T 펫택시 비추천 | 기사 일방적 취소 | 고객센터",
    "이번에 진짜 기사님이 일방적으로 취소했고 이런 적 처음임",
  ));
  assert.equal(result.decision, "candidate");
  assert.ok(result.reason_codes.includes("title_explicit_personal_complaint"));
});

test("legal and SEO complaint-shaped titles do not become candidates", () => {
  const falseCandidateTitles = [
    '"단순변심 환불 불가"는 무효입니다 — 온라인쇼핑 청약철회권',
    "고유가 피해지원금, 8월 31일 자정 지나면 사라집니다 (환불 안 됨)",
    "바이비트 출금 오류 때문에 속상하신가요?",
    "숙소 예약 취소수수료 아끼는 법｜무료취소·환불불가 요금제 비교",
    "유튜브 프리미엄 무료 체험 6개월 안 됨 원인, 결제 오류, 해지 환불 ....",
    "인터넷으로 산 물건 단순변심 환불 가능할까? “환불 불가”라고 써....",
    '중고거래 "환불 안 됨" 특약, 법적 효력 있을까? (feat. 사기죄 고소)',
    "헬스장 폐업, 남은 회원권 환불 못 받았다면? 형사고소·민사소송 총....",
    "헬스장·필라테스 환불 거부·먹튀 대처법! 위약금 10% 기준과 카드사....",
  ];
  for (const title of falseCandidateTitles) {
    assert.equal(classifySourceAdmission(naverSignal(title, "관련 기준과 절차를 정리합니다.")).decision, "reject", title);
  }
});

test("explicit complaint without personal title framing requires context instead of auto-candidate", () => {
  const result = classifySourceAdmission(naverSignal(
    "김포공항 국내선 평일 수속 소요시간, 이스타 예약조회 안됨, 영어....",
    "출발 당일 셀프체크인을 하려는데 아고다에서 예약한 이스타항공 예약조회가 아예 안되더라고요",
  ));
  assert.equal(result.decision, "review");
  assert.ok(result.reason_codes.includes("title_explicit_complaint_requires_context"));
});

test("information-shaped title with explicit first-hand experience is preserved for review", () => {
  const result = classifySourceAdmission(naverSignal(
    "아고다 취소불가 숙소 취소 가능할까? 예약 일주일 지난 실제 후기",
    "나는 출장 일정 변경 때문에 직접 취소를 요청했는데 환불 불가 상품이었다",
  ));
  assert.equal(result.decision, "review");
  assert.ok(result.reason_codes.includes("title_mixed_information_and_experience"));
});

test("generic fraud, harm, loss, and account-lock topics never auto-promote", () => {
  for (const title of [
    "중고거래 사기 피해",
    "택배 분실 대응 사례",
    "카카오톡 계정 도용 문제",
    "중고거래 계좌 정지 이의신청",
  ]) {
    assert.notEqual(classifySourceAdmission(naverSignal(title, "관련 사례를 살펴봅니다.")).decision, "candidate");
  }
});

test("topic-only query-shaped title rejects instead of flooding REVIEW", () => {
  const result = classifySourceAdmission(naverSignal(
    "배달 최소주문금액",
    "배달 주문을 할 때 최소주문금액 관련 내용을 정리했습니다.",
  ));
  assert.equal(result.decision, "reject");
});

test("opaque title cannot be promoted by a complaint-heavy retrieval snippet", () => {
  const result = classifySourceAdmission(naverSignal(
    "벼락치기",
    "안녕하십니까 운동을 진짜 왕 열심히했어 한동안 저 헬스장 존나 비추. 직원싸가지부터 별로였고 환불받음",
  ));
  assert.equal(result.decision, "reject");
  assert.equal(result.requires_full_context, false);
  assert.ok(result.reason_codes.includes("title_no_complaint_signal"));
});

test("resale listing title outranks an incidental ticket refund complaint", () => {
  const result = classifySourceAdmission(naverSignal(
    "임영웅 고양 콘서트 티켓 원가양도합니다",
    "엄마가 해달래서 티켓팅 했는데 연석 실패했고 취소하려고 보니 티켓수수료는 환불안됨",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("title_commercial_or_seo"));
});

test("fraud warning and countermeasure article is information rather than complaint source", () => {
  const result = classifySourceAdmission(naverSignal(
    "이비스턴 사기 쇼핑몰 사칭 구매대행 피해 주의해야 할 수법과 대응....",
    "계좌이체 요구 후 환불 불가를 통보하는 경우가 많아 피해 수법을 정리합니다.",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("title_information_or_guide"));
});

test("informational checklist snippet demotes before generic review preservation", () => {
  const result = classifySourceAdmission(naverSignal(
    "예약했는데 당일 숙소 이용 불가? 세종 스테이조이 환불 ....",
    "✔ 예약 확정 문자 보관 ✔ 결제 내역 캡처 ✔ 취소·환불 규정 확인 ✔ 숙소 주소와 연락처 확인",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("snippet_information_only"));
});

test("provider title is authoritative over retrieval description", () => {
  const signal = naverSignal("고객센터 전화번호 총정리", "환불이 안 돼서 너무 화가 났다");
  assert.equal(extractSourceTitle(signal), "고객센터 전화번호 총정리");
  assert.equal(classifySourceAdmission(signal).decision, "reject");
});

test("Source Lab uses campaign development pool and excludes blind 120 from admission views", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /loadCampaignPool/);
  assert.match(service, /getEvaluationSampleIds/);
  assert.match(service, /filter\(\(id\) => !evaluationIds\.has\(id\)\)/);
  assert.match(service, /blindExcluded: evaluationIds\.size/);
});

test("Source Lab makes no-LLM admission active and paid Silver requires explicit opt-in", async () => {
  const [page, runner] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("scripts/run-silver-semantic-pipeline.mjs"),
  ]);
  assert.match(page, /No-LLM Source Admission/);
  assert.match(page, /snippet 한 문장만으로 complaint candidate를 만들지 않습니다/);
  assert.match(page, /AI Silver는 active admission path가 아닙니다/);
  assert.match(page, /Blind 120은 이 화면의 admission 계산·queue에서 제외됩니다/);
  assert.doesNotMatch(page, /npm run classify:silver:live/);
  assert.match(runner, /ALLOW_PAID_SILVER_LLM/);
  assert.match(runner, /disabled by default/);
});

test("production deployment remains disabled", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  assert.equal(vercel.git.deploymentEnabled, false);
});
