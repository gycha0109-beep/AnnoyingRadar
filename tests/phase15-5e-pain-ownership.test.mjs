import assert from "node:assert/strict";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import {
  classifyPainOwnership,
  classifySourceAdmission,
  classifySourceIntent,
  PAIN_OWNERSHIP_VERSION,
  SOURCE_ADMISSION_POLICY_REVISION,
} from "../lib/sources/source-admission.mjs";

function naverSignal({ title, description = "", author = "개인 블로그" }) {
  return {
    source_platform: "naver_blog",
    author_handle: author,
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    source_metadata: {
      provider_title: title,
      provider_description: description,
    },
  };
}

test("pain ownership policy is explicitly versioned without changing the v0.8 audit protocol", () => {
  assert.equal(PAIN_OWNERSHIP_VERSION, "pain-ownership-v0.1");
  assert.equal(SOURCE_ADMISSION_POLICY_REVISION, "source-admission-v0.8-pain-ownership-v0.1");
});

test("law-firm repackaging of an Ibistern victim case is borrowed lead-gen and rejected", () => {
  const signal = naverSignal({
    title: "이비스턴 사기 쇼핑몰 사칭 구매대행 피해 주의하세요",
    description: "사기 업체명 : 이비스턴 사칭 사기 수법 : 유명 해외 쇼핑몰 이비스턴을 사칭해 허위 사이트를 운영합니다. 정상적인 구매대행 서비스를 가장해 선입금 요구를 합니다. 결제 후 상품을 받지 못하거나 가짜 배송정보가 제공됩니다.",
    author: "최지연 변호사ㅣ1551-7202",
  });

  assert.equal(classifyPainOwnership(signal).ownership, "borrowed_leadgen");
  const intent = classifySourceIntent(signal);
  assert.equal(intent.intent, "lead_gen");
  assert.equal(intent.pain_role, "borrowed");

  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "reject");
  assert.equal(admission.requires_full_context, false);
  assert.ok(admission.reason_codes.includes("title_borrowed_pain_leadgen"));

  const prefilter = runDeterministicComplaintPrefilter(signal);
  assert.equal(prefilter.decision, "reject");
  assert.ok(prefilter.reason_codes.includes("source_title_borrowed_pain_leadgen"));
});

test("law-firm team-mission scam case packaging is borrowed pain even when the harm itself is concrete", () => {
  const signal = naverSignal({
    title: "설림핏트 사기 쇼핑몰 부업 팀미션 피해 수법과 주의사항 안내",
    description: "사기 업체명 : 설림핏트 사칭 사기 수법 : 쇼핑몰 부업 명목으로 접근해 팀미션 참여를 유도하고 초기 투자금을 요구합니다. 일정 금액 이상 구매를 강요하고 실제 상품 배송이 늦거나 이루어지지 않습니다.",
    author: "법무법인 나란 북부분사무소ㅣ1551-7202",
  });

  assert.equal(classifyPainOwnership(signal).ownership, "borrowed_leadgen");
  assert.equal(classifySourceAdmission(signal).decision, "reject");
});

test("legal consultation publisher case framing is rejected before warning-report promotion", () => {
  const signal = naverSignal({
    title: "고틴마켓 사기 쇼핑몰 사칭피해 구조와 대응 포인트는",
    description: "가짜 쇼핑몰에서는 결제 이후 추가 미션이나 충전, 정산 조건이 계속 붙는 경우가 있습니다. 피해자는 환불과 출금을 요구하지만 추가 입금을 요구받는 사례가 많습니다.",
    author: "법률상담 | 1551-7201",
  });

  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "reject");
  assert.ok(admission.reason_codes.includes("title_borrowed_pain_leadgen"));
});

test("an independent warning/report is not treated as borrowed lead-gen without professional lead-gen provenance", () => {
  const signal = naverSignal({
    title: "대한항공 사칭 불법광고 절대 속지 마세요",
    description: "인스타그램에서 대한항공을 사칭한 불법광고가 반복해서 노출되고 있습니다. 결제를 유도하는 링크가 있어 주의가 필요합니다.",
    author: "개인 관찰 기록",
  });

  assert.equal(classifyPainOwnership(signal).ownership, "reported");
  const admission = classifySourceAdmission(signal);
  assert.notEqual(admission.decision, "reject");
  assert.equal(admission.reason_codes.includes("title_borrowed_pain_leadgen"), false);
});

test("a professional author's unrelated first-hand personal complaint is not rejected solely because of occupation", () => {
  const signal = naverSignal({
    title: "로마 숙소 아고다 고객센터 환불 불가 썰",
    description: "제가 예약한 숙소가 취소됐는데 호텔 측 답변은 환불 불가였습니다.",
    author: "김OO 변호사의 일상",
  });

  assert.equal(classifyPainOwnership(signal).ownership, "owned");
  const admission = classifySourceAdmission(signal);
  assert.equal(admission.decision, "candidate");
  assert.equal(admission.reason_codes.includes("title_borrowed_pain_leadgen"), false);
});

test("case-shaped warning from an ordinary source stays reported rather than being rejected by content alone", () => {
  const signal = naverSignal({
    title: "쇼핑몰 사칭 피해 주의하세요",
    description: "피해자 사례가 늘고 있어 결제 전 도메인과 사업자 정보를 확인할 필요가 있습니다.",
    author: "지역 소비자 모임",
  });

  assert.equal(classifyPainOwnership(signal).ownership, "reported");
  assert.notEqual(classifySourceAdmission(signal).decision, "reject");
});
