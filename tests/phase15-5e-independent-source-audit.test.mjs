import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSourceAdmissionIndependentAudit,
  findIndependentAuditRisk,
  SOURCE_ADMISSION_AUDIT_RANDOM_SIZE,
  SOURCE_ADMISSION_AUDIT_STATE_VERSION,
  SOURCE_ADMISSION_AUDIT_VERSION,
} from "../lib/sources/source-admission-audit.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function naverSignal(id, title, description = "") {
  return {
    id,
    source_platform: "naver_blog",
    raw_text: [title, description].filter(Boolean).join("\n\n"),
    source_metadata: { provider_title: title, provider_description: description },
    canonical_url: `https://blog.naver.com/example/${id}`,
  };
}

test("independent audit contract is versioned and uses a fixed random control size", () => {
  assert.equal(SOURCE_ADMISSION_AUDIT_VERSION, "source-admission-independent-audit-v0.1");
  assert.equal(SOURCE_ADMISSION_AUDIT_STATE_VERSION, "source-admission-audit-state-v0.1");
  assert.equal(SOURCE_ADMISSION_AUDIT_RANDOM_SIZE, 100);
});

test("audit-only risk probes catch structural access and cost harms without making a decision", () => {
  const access = findIndependentAuditRisk(naverSignal(
    "risk-access",
    "키오스크 때문에 부모님은 주문을 못 하고 그냥 돌아왔습니다",
  ));
  assert.equal(access.flagged, true);
  assert.ok(access.reason_codes.includes("dependency_blocks_access"));

  const cost = findIndependentAuditRisk(naverSignal(
    "risk-cost",
    "수리 견적 250000원이라 결국 교체했습니다",
  ));
  assert.equal(cost.flagged, true);
  assert.ok(cost.reason_codes.includes("cost_shock_or_loss"));

  assert.equal(Object.hasOwn(access, "decision"), false);
  assert.equal(Object.hasOwn(cost, "decision"), false);
});

test("ordinary neutral titles are not swept solely for containing generic domain words", () => {
  const result = findIndependentAuditRisk(naverSignal(
    "neutral",
    "서울 택시 이용 후기",
    "주말에 택시를 타고 이동했습니다.",
  ));
  assert.equal(result.flagged, false);
  assert.deepEqual(result.reason_codes, []);
});

test("audit manifest separates boundary, adversarial reject risk, and deterministic random control under the active policy", () => {
  const signals = [
    naverSignal("candidate", "로마 숙소 아고다 고객센터 환불 불가 썰", "호텔 측 답변은 환불 불가였습니다."),
    naverSignal("boundary", "여기어때 오키나와 숙소 태풍 결항 환불 후기", "무사히 환불 끝냈으니 내년 여행을 노려봐야겠다"),
    naverSignal("risk-access", "키오스크 때문에 부모님은 주문을 못 하고 그냥 돌아왔습니다"),
    naverSignal("risk-cost", "수리 견적 250000원이라 결국 교체했습니다"),
    ...Array.from({ length: 110 }, (_, index) => naverSignal(`plain-${index}`, `평범한 일상 기록 ${index}`, "오늘 있었던 일을 적었습니다.")),
  ];

  const audit = buildSourceAdmissionIndependentAudit(signals);
  assert.equal(audit.manifest.candidate_count, 1);
  assert.equal(audit.manifest.boundary_count, 1);
  assert.equal(audit.manifest.reject_risk_count, 2);
  assert.equal(audit.manifest.reject_random_count, 100);
  assert.equal(audit.manifest.audit_state_version, "source-admission-audit-state-v0.1");
  assert.equal(
    audit.manifest.admission_policy_revision,
    "source-admission-v0.8-pain-ownership-v0.1-causality-v0.1-recovery-v0.1",
  );
  assert.equal(audit.boundary_set.length, 1);
  assert.deepEqual(new Set(audit.reject_risk_set.map((item) => item.id)), new Set(["risk-access", "risk-cost"]));
  assert.equal(audit.reject_random_set.length, 100);
  assert.equal(audit.reject_random_set.some((item) => item.id === "risk-access" || item.id === "risk-cost"), false);
  assert.equal(Object.hasOwn(audit.boundary_set[0], "admission"), false);
  assert.equal(Object.hasOwn(audit.boundary_set[0], "reason_codes"), false);
  assert.match(audit.boundary_set[0].admission_state_fingerprint, /^[0-9a-f]{16}$/);
});

test("policy-sensitive rejects are marked unsafe for legacy label replay", () => {
  const audit = buildSourceAdmissionIndependentAudit([
    naverSignal(
      "self-caused",
      "덕질과 효도를 한 번에 교토&고베 4)",
      "점심 특선 메뉴는 예약 필수인데 뭘 잘못해가지고 자리만 예약되고 점심 특선은 예약이 안됨ㅋ",
    ),
    ...Array.from({ length: 105 }, (_, index) => naverSignal(`plain-${index}`, `평범한 일상 기록 ${index}`)),
  ]);
  const item = [...audit.reject_risk_set, ...audit.reject_random_set].find((row) => row.id === "self-caused");
  assert.ok(item);
  assert.equal(item.legacy_replay_safe, false);
  assert.match(item.admission_state_fingerprint, /^[0-9a-f]{16}$/);
});

test("random control and pool fingerprint are stable regardless of input order", () => {
  const signals = Array.from({ length: 130 }, (_, index) => naverSignal(`stable-${index}`, `일상 메모 ${index}`));
  const forward = buildSourceAdmissionIndependentAudit(signals);
  const reverse = buildSourceAdmissionIndependentAudit([...signals].reverse());
  assert.equal(forward.manifest.pool_fingerprint, reverse.manifest.pool_fingerprint);
  assert.deepEqual(
    forward.reject_random_set.map((item) => item.id),
    reverse.reject_random_set.map((item) => item.id),
  );
});

test("curator audit remains blind-safe and browser-local rather than a production DB authority", async () => {
  const [service, page, client, vercel] = await Promise.all([
    read("lib/sources/service.mjs"),
    read("app/curator/sources/audit/page.js"),
    read("app/components/source-admission-independent-audit.js"),
    read("vercel.json"),
  ]);

  assert.match(service, /getSourceAdmissionIndependentAudit/);
  assert.match(service, /getEvaluationSampleIds/);
  assert.match(service, /filter\(\(id\) => !evaluationIds\.has\(id\)\)/);
  assert.match(page, /Independent Human Audit/);
  assert.match(page, /production DB에 저장하지 않고/);
  assert.match(client, /window\.localStorage/);
  assert.match(client, /JSON 내보내기/);
  assert.match(client, /CSV 내보내기/);
  assert.match(client, /JSON 불러오기/);
  assert.doesNotMatch(client, /fetch\s*\(/);
  assert.equal(JSON.parse(vercel).git.deploymentEnabled, false);
});

test("same-pool human labels replay only when set and admission state remain compatible", async () => {
  const client = await read("app/components/source-admission-independent-audit.js");
  assert.match(client, /pool_fingerprint !== audit\.manifest\.pool_fingerprint/);
  assert.doesNotMatch(client, /parsed\?\.manifest\?\.admission_version !== audit\.manifest\.admission_version/);
  assert.match(client, /previousAdmission/);
  assert.match(client, /validItemSets/);
  assert.match(client, /validItemStates/);
  assert.match(client, /label\?\.set !== currentSet/);
  assert.match(client, /label\.state_fingerprint !== currentState\.fingerprint/);
  assert.match(client, /legacyReplaySafe/);
  assert.match(client, /정책 state가 바뀐 항목도 포함됩니다/);
});
