import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCanonicalProblemDraftQueue,
  evaluateCanonicalProblemDraft,
} from "../lib/sources/canonical-problem-draft.mjs";
import { buildIncidentAwareProblemClusters } from "../lib/sources/source-problem-formation.mjs";

const audit = JSON.parse(await readFile(
  new URL("./fixtures/phase15-6a-formation-audit.json", import.meta.url),
  "utf8",
));

const proposalsBySignature = {
  gym_refund_enforcement: {
    title: "헬스장 환불 지연이 장기화되면 소비자가 외부 절차를 직접 밟아야 한다",
    summary: "서로 다른 두 환불 분쟁에서 정상적인 환불 요청만으로 처리가 끝나지 않았고, 소비자가 내용증명·민원·강제집행 등 외부 절차까지 직접 진행해야 했다.",
    target_user: "헬스장·PT 이용권 환불을 요청하는 소비자",
    situation: "사업자의 환불 처리 지연 또는 반복 회피가 장기화된 상황",
    category: "consumer_refund",
  },
  lodging_exception_refund_coordination: {
    title: "숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다",
    summary: "서로 다른 두 예약 사건에서 예외 취소·환불을 위해 숙소의 승인 또는 응답이 필요했고, 사용자가 예약 플랫폼과 숙소 양쪽에 반복 연락해 절차를 진행해야 했다.",
    target_user: "OTA를 통해 숙소를 예약한 여행자",
    situation: "일정 변경·운항 결항 등으로 예외 취소 승인이 필요한 상황",
    category: "travel_refund",
  },
};

test("Phase 15.6C produces exactly two non-persisted draft candidates from the audited repeated clusters", () => {
  const clusters = buildIncidentAwareProblemClusters(audit.items);
  const queue = buildCanonicalProblemDraftQueue({ clusters, proposalsBySignature });

  assert.equal(queue.length, 2);
  assert.deepEqual(
    queue.map((item) => item.draft.problem_signature),
    ["gym_refund_enforcement", "lodging_exception_refund_coordination"],
  );
  for (const item of queue) {
    assert.equal(item.draft_state, "ready");
    assert.equal(item.draft.persistence_state, "not_persisted");
    assert.equal(item.draft.publication_state, "not_published");
    assert.ok(item.draft.incident_count >= 2);
  }
});

test("a singleton cluster cannot become a canonical draft candidate", () => {
  const result = evaluateCanonicalProblemDraft({
    cluster: {
      problem_signature: "repair_economic_total_loss",
      source_count: 1,
      incident_count: 1,
      source_signal_ids: ["source-1"],
      incident_keys: ["incident-1"],
      repeat_eligible: false,
    },
    proposal: {
      title: "수리비가 제품 교체를 유도한다",
      summary: "한 건의 사례만 존재한다.",
    },
  });

  assert.equal(result.draft_state, "blocked");
  assert.deepEqual(result.reason_codes, ["draft_requires_two_independent_incidents"]);
});

test("multiple posts from one incident cannot satisfy the repeated-problem gate", () => {
  const result = evaluateCanonicalProblemDraft({
    cluster: {
      problem_signature: "same_case_repeat",
      source_count: 2,
      incident_count: 1,
      source_signal_ids: ["source-a", "source-b"],
      incident_keys: ["one-incident"],
      repeat_eligible: true,
    },
    proposal: {
      title: "겉보기에는 두 건인 문제",
      summary: "실제로는 같은 사건의 게시물 두 개다.",
    },
  });

  assert.equal(result.draft_state, "blocked");
  assert.deepEqual(result.reason_codes, ["draft_requires_two_independent_incidents"]);
});

test("incomplete incident or source identity fails safe to review", () => {
  const incompleteIncident = evaluateCanonicalProblemDraft({
    cluster: {
      problem_signature: "repeat",
      source_count: 2,
      incident_count: 2,
      source_signal_ids: ["source-a", "source-b"],
      incident_keys: ["incident-a"],
      repeat_eligible: true,
    },
    proposal: {
      title: "반복 문제",
      summary: "두 독립 사건이어야 한다.",
    },
  });
  assert.equal(incompleteIncident.draft_state, "review");

  const incompleteSource = evaluateCanonicalProblemDraft({
    cluster: {
      problem_signature: "repeat",
      source_count: 3,
      incident_count: 2,
      source_signal_ids: ["source-a", "source-b"],
      incident_keys: ["incident-a", "incident-b"],
      repeat_eligible: true,
    },
    proposal: {
      title: "반복 문제",
      summary: "출처 identity도 완전해야 한다.",
    },
  });
  assert.equal(incompleteSource.draft_state, "review");
});

test("draft title and summary are mandatory and constrained before curator review", () => {
  const cluster = {
    problem_signature: "repeat",
    source_count: 2,
    incident_count: 2,
    source_signal_ids: ["source-a", "source-b"],
    incident_keys: ["incident-a", "incident-b"],
    repeat_eligible: true,
  };

  assert.equal(evaluateCanonicalProblemDraft({
    cluster,
    proposal: { title: "", summary: "summary" },
  }).draft_state, "blocked");

  assert.equal(evaluateCanonicalProblemDraft({
    cluster,
    proposal: { title: "title", summary: "" },
  }).draft_state, "blocked");

  assert.equal(evaluateCanonicalProblemDraft({
    cluster,
    proposal: { title: "x".repeat(241), summary: "summary" },
  }).draft_state, "blocked");
});
