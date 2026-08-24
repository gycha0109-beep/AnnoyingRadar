import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import {
  classifySourceAdmission,
  classifySourceCausality,
  classifySourceRecovery,
  SOURCE_ADMISSION_POLICY_REVISION,
  SOURCE_CAUSALITY_VERSION,
  SOURCE_RECOVERY_VERSION,
} from "../lib/sources/source-admission-policy.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(title, description = "", author_handle = "") {
  return {
    source_platform: "naver_blog",
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    author_handle,
    source_metadata: { provider_title: title, provider_description: description },
  };
}

test("causality and recovery policy are explicitly versioned on top of v0.8", () => {
  assert.equal(SOURCE_CAUSALITY_VERSION, "source-causality-v0.1");
  assert.equal(SOURCE_RECOVERY_VERSION, "source-recovery-v0.1");
  assert.equal(
    SOURCE_ADMISSION_POLICY_REVISION,
    "source-admission-v0.8-pain-ownership-v0.1-causality-v0.1-recovery-v0.1",
  );
});

test("Kobe lunch reservation mistake is self-caused and rejected", () => {
  const signal = naverSignal(
    "덕질과 효도를 한 번에 교토&고베 4) 고베 산노미야 킷쇼키치 고베규....",
    "점심 특선 메뉴는 예약 필수인데 뭘 잘못해가지고 자리만 예약되고 점심 특선은 예약이 안됨ㅋ 그래서 그냥 부위별로 조금씩 시켰당",
  );
  assert.equal(classifySourceCausality(signal).causality, "self_caused_mistake");
  const result = classifySourceAdmission(signal);
  assert.equal(result.decision, "reject");
  assert.deepEqual(result.reason_codes, ["snippet_self_caused_mistake"]);
});

test("wrong stadium ticket purchase is rejected as user booking error", () => {
  const result = classifySourceAdmission(naverSignal(
    "[미국 LA인턴 일기13] 16시간동안 플릭스 버스타고 LA에서 샌프란 리얼....",
    "티켓마스터에서 사면 환불안됨. 썅 사고보니 경기 홈이 다저스홈이 아니라 샌프란 자이언츠 홈이였더.",
  ));
  assert.equal(result.decision, "reject");
  assert.ok(result.reason_codes.includes("snippet_self_caused_mistake"));
});

test("forgotten free-age ticket purchase is rejected as user mistake", () => {
  const result = classifySourceAdmission(naverSignal(
    "[아기랑 오사카] 유니버셜 스튜디오 재팬 티켓, 식사, 코스, 볼거리",
    "만 4세는 무료라는거 이거 깜빡하고 티켓 사서 개빡침 환불 안됨 결국 당근에 올렸어요ㅠㅠ",
  ));
  assert.equal(result.decision, "reject");
});

test("later discovery of clearly stated baggage option is rejected as condition-check mistake", () => {
  const result = classifySourceAdmission(naverSignal(
    "홍콩 익스프레스항공 그리고 홍콩공항 제 2터미널",
    "우리도 나중에 다시 꼼꼼히 확인해보니 우리의 항공 티켓은 캐리백, 위탁 수화물 딱 두 개의 옵션만 가능했다. 기내수화물 포함 안됨.",
  ));
  assert.equal(result.decision, "reject");
});

test("external airline delay remains review and is not confused with self-caused mistakes", () => {
  const signal = naverSignal(
    "@toronto / 억까 끝에 만난 거대함",
    "이미 토론토에서 탈 버스 다 예매해 뒀는데 취소 환불 절대 안 됨. 심지어 30분 뒤에 또 지연... 끝없는 지연의 굴레에 갇혔습니다. 하루 종일 항공사 붙잡고 전화만 하기.",
  );
  assert.equal(classifySourceCausality(signal).causality, "external_or_unresolved");
  assert.equal(classifySourceAdmission(signal).decision, "review");
});

test("repair-cost pain is not rejected merely because the original device damage was accidental", () => {
  const signal = naverSignal(
    "수리비 87만원?... 어쩔수 없이 새로 구입한 Z폴드8 와이드",
    "2년간 사용한 내 핸드폰이 낙상사고로 중상을 입어 서비스센터를 찾아갔다. 수리금액은 87만원이라고 했다.",
  );
  assert.equal(classifySourceCausality(signal).causality, "external_or_unresolved");
  assert.notEqual(classifySourceAdmission(signal).reason_codes[0], "snippet_self_caused_mistake");
});

test("incidental parenthetical complaint is rejected instead of consuming full-context review", () => {
  const signal = naverSignal(
    "so what? we hot we young",
    "(피규어충동구매햇는데환불안됨) 하..나 연금복권 다섯장 샀는데 다 낙첨이야 내가 자른 빵 뭐게",
  );
  const result = classifySourceAdmission(signal);
  assert.equal(result.decision, "reject");
  assert.deepEqual(result.reason_codes, ["snippet_incidental_complaint_only"]);
  const prefilter = runDeterministicComplaintPrefilter(signal);
  assert.equal(prefilter.decision, "reject");
  assert.ok(prefilter.reason_codes.includes("source_snippet_incidental_complaint_only"));
});

test("first-hand refund dispute escalation is recovered as a candidate", () => {
  const signal = naverSignal(
    "[독산동 헬스장 환불] ①⑨ 강제집행(압류) 진행",
    "헬스장 입구 도착 역시나 직원 아무도 없고 법원에서 나왔다하니 인포 알바생은 엄청 당황했다. 집행관이 설명했다.",
    "매일 새롭다옹",
  );
  assert.equal(classifySourceRecovery(signal).recovery, "first_hand_dispute_escalation");
  const result = classifySourceAdmission(signal);
  assert.equal(result.decision, "candidate");
  assert.deepEqual(result.reason_codes, ["title_first_hand_dispute_escalation"]);
});

test("first-hand refund dispute follow-up remains candidate even when the title is a numbered series", () => {
  const signal = naverSignal(
    "[독산동 헬스장 환불] ②ⓞ 금천구청 민원 신고·접수 4부",
    "오전엔 강제집행 오후엔 민원신고 그대로 내용 적어서 보냈다. 내가 현장 방문했고 관리자 없었다. 반복적인 적발과 과태료 부과에도 운영방식이 개선되지 않았다.",
    "매일 새롭다옹",
  );
  assert.equal(classifySourceAdmission(signal).decision, "candidate");
});

test("defect-driven purchase and refund review is recovered from product-promotion rejection", () => {
  const signal = naverSignal(
    "더블알엘(RRL) 뉴스보이 자켓 구매 및 환불후기 | 뽑기 실패..",
    "오늘은 정말 기대했던 뉴스보이 레더 자켓 구매 후기이자 아쉽게도 제품하자(?)로 인해 환불한 후기입니다.",
    "구매자",
  );
  assert.equal(classifySourceRecovery(signal).recovery, "defect_driven_refund");
  const result = classifySourceAdmission(signal);
  assert.equal(result.decision, "candidate");
  assert.deepEqual(result.reason_codes, ["title_first_hand_defect_refund"]);
});

test("generic refund enforcement guide is not promoted without lived dispute evidence", () => {
  const signal = naverSignal(
    "헬스장 환불 강제집행 방법 총정리",
    "환불이 되지 않을 때 강제집행을 신청하는 방법과 준비 서류를 정리합니다.",
    "생활정보",
  );
  assert.notEqual(classifySourceRecovery(signal).recovery, "first_hand_dispute_escalation");
  assert.notEqual(classifySourceAdmission(signal).decision, "candidate");
});

test("borrowed professional lead-gen cases cannot be rescued by dispute wording", () => {
  const signal = naverSignal(
    "헬스장 환불 강제집행 피해 사례와 대응",
    "피해자는 환불을 받지 못해 강제집행과 민원 신고를 진행했습니다. 비슷한 피해가 있다면 법률상담을 받으세요.",
    "법무법인 나란",
  );
  assert.equal(classifySourceRecovery(signal).recovery, null);
  assert.equal(classifySourceAdmission(signal).decision, "reject");
});

test("production service routes stats and queue through the policy overlay", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /from "\.\/source-admission-policy\.mjs"/);
  const contracts = await read("lib/sources/complaint-contracts.mjs");
  assert.match(contracts, /from "\.\/source-admission-policy\.mjs"/);
});
