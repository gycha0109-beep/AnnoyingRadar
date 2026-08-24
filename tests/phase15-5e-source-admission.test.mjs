import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import {
  classifySourceAdmission,
  classifySourceIntent,
  extractSourceTitle,
  SOURCE_ADMISSION_VERSION,
} from "../lib/sources/source-admission.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(title, description = "") {
  return {
    source_platform: "naver_blog",
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    source_metadata: { provider_title: title, provider_description: description },
    is_quote_post: null,
  };
}

test("Phase 15.5E calibrated admission version is v0.8", () => {
  assert.equal(SOURCE_ADMISSION_VERSION, "source-admission-v0.8");
});

test("canonical information stays reject even with first-person friction", () => {
  const signal = naverSignal(
    "카카오톡 로그인 오류·계정 도용·결제 문제, 상황별 해결 경로 정리 직접 해봤어요",
    "저도 일시적인 오류 때문에 로그인 안 될 때가 있었어요.",
  );
  assert.equal(classifySourceAdmission(signal).decision, "reject");
  const prefilter = runDeterministicComplaintPrefilter(signal);
  assert.equal(prefilter.decision, "reject");
  assert.ok(prefilter.reason_codes.includes("source_title_information_or_guide"));
});

test("conditional guide grammar stays reject", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "네이버쇼핑 판매자 신고 방법 (환불 거부당했을 때 순서대로 대응하....",
    "환불을 거부당했다면 분쟁조정센터에 접수할 수 있습니다.",
  )).decision, "reject");
});

test("positive service and product sources stay reject", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "하수구청소 맡길 일이 생겨서 간 안산 동네방네, 하수구막힘 처리 과정이 깔끔했어요",
    "냄새가 진해져 업체를 찾았습니다.",
  )).decision, "reject");
  assert.equal(classifySourceAdmission(naverSignal(
    "용산 피프틴커피 배달 후기 ☕ 1인 가구도 부담 없는 최소주문금액!",
    "최소주문금액이 불편했지만 부담 없이 주문했습니다.",
  )).decision, "reject");
});

test("existing high-precision personal complaint candidates remain candidates", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "로마 숙소 아고다 고객센터 환불 불가 썰",
    "호텔 측 답변은 환불 불가였습니다.",
  )).decision, "candidate");
  assert.equal(classifySourceAdmission(naverSignal(
    "카카오 T 펫택시 비추천 | 기사 일방적 취소 | 고객센터",
    "이번에 진짜 기사님이 일방적으로 취소했고 이런 적 처음임",
  )).decision, "candidate");
});

test("legal and SEO complaint-shaped titles stay reject", () => {
  const falseCandidateTitles = [
    '"단순변심 환불 불가"는 무효입니다 — 온라인쇼핑 청약철회권',
    "고유가 피해지원금, 8월 31일 자정 지나면 사라집니다 (환불 안 됨)",
    "바이비트 출금 오류 때문에 속상하신가요?",
    "숙소 예약 취소수수료 아끼는 법｜무료취소·환불불가 요금제 비교",
    "유튜브 프리미엄 무료 체험 6개월 안 됨 원인, 결제 오류, 해지 환불 ....",
    '중고거래 "환불 안 됨" 특약, 법적 효력 있을까? (feat. 사기죄 고소)',
    "헬스장 폐업, 남은 회원권 환불 못 받았다면? 형사고소·민사소송 총....",
    "헬스장·필라테스 환불 거부·먹튀 대처법! 위약금 10% 기준과 카드사....",
  ];
  for (const title of falseCandidateTitles) {
    assert.equal(classifySourceAdmission(naverSignal(title, "관련 기준과 절차를 정리합니다.")).decision, "reject", title);
  }
});

test("human calibration promotes explicit first-hand reservation failure", () => {
  const result = classifySourceAdmission(naverSignal(
    "김포공항 국내선 평일 수속 소요시간, 이스타 예약조회 안됨, 영어....",
    "출발 당일 셀프체크인을 하려는데 아고다에서 예약한 이스타항공 예약조회가 아예 안되더라고요",
  ));
  assert.equal(result.decision, "candidate");
  assert.ok(result.reason_codes.includes("title_explicit_first_hand_complaint"));
});

test("human calibration promotes actual first-hand mixed guide title", () => {
  const result = classifySourceAdmission(naverSignal(
    "아고다 취소불가 숙소 취소 가능할까? 예약 일주일 지난 실제 후기",
    "나는 출장 일정 변경 때문에 직접 취소를 요청했는데 환불 불가 상품이었다",
  ));
  assert.equal(result.decision, "candidate");
  assert.ok(result.reason_codes.includes("title_actual_experience_complaint_central"));
});

test("refund outcome ambiguity stays review", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "여기어때 오키나와 숙소 태풍 결항 환불 후기",
    "무사히 환불 끝냈으니 내년 여행을 노려봐야겠다",
  )).decision, "review");
});

test("incidental parenthetical human calibration is review, never candidate", () => {
  const result = classifySourceAdmission(naverSignal(
    "so what? we hot we young",
    "(피규어충동구매햇는데환불안됨) 하..나 연금복권 다섯장 샀는데 다 낙첨이야 내가 자른 빵 뭐게",
  ));
  assert.equal(result.decision, "review");
  assert.ok(result.reason_codes.includes("snippet_incidental_complaint_requires_context"));
});

test("opaque title recovers only high-confidence direct harm", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "어찌하여 또 영국인 것이냐.",
    "어학원에서는 환불된다고 해놓고 환불안됨 엔딩, 담당자랑 전화로 개싸움. 다시 문의하려고 할때 담당자가 사라짐",
  )).decision, "candidate");
  assert.equal(classifySourceAdmission(naverSignal(
    "시리야 노래 틀어줘 정훈희의 안개",
    "우버 취소한거 환불이 안됨 개빡친다. 최소 2주 ~ 최대 2달 기다리래 13만원 도랏나",
  )).decision, "candidate");
  assert.equal(classifySourceAdmission(naverSignal(
    "벼락치기",
    "저 헬스장 존나 비추. 직원싸가지부터 별로였고 환불받음",
  )).decision, "reject");
});

test("one-month wasted-trip lived harm is candidate", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "광주정신병원 가기 전 아무도 안 알려주는 충격 진실",
    "저도 모르고 한 달 넘게 헛걸음만 했거든요. 한 달 헛걸음한 사람으로서 드리는 말입니다.",
  )).decision, "candidate");
});

test("moderate lived friction remains review", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "[방콕 7박 9일 (7/9)] 여행 기록....",
    "근데 주문이 계속 취소되는 거임. 검색해 보니 그랩 구매대행이라는 게 있어서 그걸로 주문했음",
  )).decision, "review");
  assert.equal(classifySourceAdmission(naverSignal(
    "덕질과 효도를 한 번에 교토&고베 4)....",
    "점심 특선 메뉴는 예약 필수인데 뭘 잘못해가지고 자리만 예약되고 점심 특선은 예약이 안됨ㅋ 그래서 그냥 부위별로 시켰당",
  )).decision, "review");
});

test("systemic service-access harm is complaint-central candidate", () => {
  const result = classifySourceAdmission(naverSignal(
    "택시 호출 앱 때문에 한국 노인들이 택시를 못 타는 현실",
    "고령층에게 택시 호출 시스템이 디지털 장벽이 되고 있습니다.",
  ));
  assert.equal(result.decision, "candidate");
  assert.ok(result.reason_codes.includes("title_systemic_service_access_harm_complaint_central"));
});

test("long service wait stays complaint-central candidate", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    '"재활 치료 6개월 기다리래요" 어린이 24만명, 하염없이 대기',
    "치료 대기 명단에 이름을 올리는 일이 반복된다고 한다.",
  )).decision, "candidate");
});

test("repair cost loss remains review", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "수리비 87만원?... 어쩔수 없이 새로 구입한 Z폴드8 와이드",
    "낙상사고로 파손되어 서비스센터에서 수리 견적을 받았습니다.",
  )).decision, "review");
});

test("warning/report intent is distinct from generic guide intent", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "이비스턴 사기 쇼핑몰 사칭 구매대행 피해 주의하세요",
    "선결제 요구 후 연락 두절 혹은 가짜 배송정보 제공",
  )).decision, "review");
  assert.equal(classifySourceAdmission(naverSignal(
    "디그리마켓 사기 쇼핑몰 구매대행 부업 피해 주의와 대처법",
    "물건 배송 지연 또는 미발송이 발생한다. 고객센터 연락이 두절되거나 상담원이 연락을 회피한다",
  )).decision, "candidate");
  assert.equal(classifySourceAdmission(naverSignal(
    "유튜브나 인스타그램에서 이런 불법광고에 절대 속지 마세요!",
    "불법광고인데 이벤트 신청만 하면 가방을 준다는 광고가 많이 보이더군요",
  )).decision, "candidate");
});

test("empathy-bait pain hook followed by product pitch is reject", () => {
  const signal = naverSignal(
    "답답한 실내 공기는 가라! 올해 가장 잘 쓴 스마트 무선 에어 서큘레이터",
    "저도 방마다 공기는 꽉 막혀있고 답답해 미치는 줄 알았거든요? 근데 드디어 정답을 찾았습니다. 오늘 소개해 드릴 제품은 바로 이 서큘레이터입니다.",
  );
  const result = classifySourceAdmission(signal);
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("snippet_pain_hook_or_promotion"));
  assert.deepEqual(classifySourceIntent(signal), { intent: "promotion", pain_role: "hook" });
});

test("generalized friction plus service pitch is reject", () => {
  const result = classifySourceAdmission(naverSignal(
    "빗썸 국민은행 계좌 개설 앱 설치 없이 웹에서 바로 진행하는 방법",
    "은행 앱을 새로 깔고 인증하는 과정이 번거로워 망설였던 경험이 한 번쯤은 있으실 텐데요. 최근 빗썸이 이러한 불편을 줄여주는 서비스를 제공합니다.",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("snippet_pain_hook_or_promotion"));
});

test("product-review pain is not source-level complaint centrality", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "[제품리뷰] 밀키트 석관동떡볶이 오리지널 후기",
    "배달을 시키자니 최소주문금액 맞추면 비싸지고요. 오늘은 제가 자주 먹는 밀키트를 소개할게요!",
  )).decision, "reject");
  assert.equal(classifySourceAdmission(naverSignal(
    "더블알엘(RRL) 뉴스보이 자켓 구매 및 환불후기 | 뽑기 실패..",
    "제품하자(?)로 인해 환불했지만 뉴스보이 자켓이 대세이죠",
  )).decision, "reject");
});

test("resale listing remains reject", () => {
  assert.equal(classifySourceAdmission(naverSignal(
    "임영웅 고양 콘서트 티켓 원가양도합니다",
    "취소하려고 보니 티켓수수료 4,000원은 환불안됨",
  )).decision, "reject");
});

test("provider title remains authoritative", () => {
  const signal = naverSignal("고객센터 전화번호 총정리", "환불이 안 돼서 너무 화가 났다");
  assert.equal(extractSourceTitle(signal), "고객센터 전화번호 총정리");
  assert.equal(classifySourceAdmission(signal).decision, "reject");
});

test("Source Lab uses campaign development pool and excludes blind samples", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /loadCampaignPool/);
  assert.match(service, /getEvaluationSampleIds/);
  assert.match(service, /filter\(\(id\) => !evaluationIds\.has\(id\)\)/);
  assert.match(service, /blindExcluded: evaluationIds\.size/);
});

test("Source Lab keeps no-LLM admission active and paid Silver explicit opt-in", async () => {
  const [page, runner] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("scripts/run-silver-semantic-pipeline.mjs"),
  ]);
  assert.match(page, /No-LLM Source Admission/);
  assert.match(page, /AI Silver는 active admission path가 아닙니다/);
  assert.match(page, /Blind 120은 이 화면의 admission 계산·queue에서 제외됩니다/);
  assert.doesNotMatch(page, /npm run classify:silver:live/);
  assert.match(runner, /ALLOW_PAID_SILVER_LLM/);
  assert.match(runner, /disabled by default/);
});
