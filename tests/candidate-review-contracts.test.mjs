import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCandidatePatch,
  normalizeDiscardRequest,
  normalizeEvidenceMove,
  normalizeMergeRequest,
  normalizeSplitRequest,
} from "../lib/candidates/review-contracts.mjs";

test("Candidate patch accepts only bounded editable fields", () => {
  assert.deepEqual(
    normalizeCandidatePatch({
      title: "  배송 상태를 신뢰하기 어렵다  ",
      summary: "  배송 추적 정보가 갱신되지 않는다.  ",
      target_user: "구매자",
      situation: "배송 대기",
      intensity_level: "high",
      repeat_pattern_level: "strong",
      clarity_level: "clear",
      order_index: 2,
    }),
    {
      title: "배송 상태를 신뢰하기 어렵다",
      summary: "배송 추적 정보가 갱신되지 않는다.",
      target_user: "구매자",
      situation: "배송 대기",
      intensity_level: "high",
      repeat_pattern_level: "strong",
      clarity_level: "clear",
      order_index: 2,
    },
  );

  assert.throws(() => normalizeCandidatePatch({ status: "confirmed" }), /Unsupported/);
  assert.throws(() => normalizeCandidatePatch({ title: "" }), /title/);
  assert.throws(() => normalizeCandidatePatch({ order_index: -1 }), /non-negative/);
});

test("discard, move and merge requests are strict", () => {
  assert.deepEqual(normalizeDiscardRequest({ discard_reason: "중복 문제" }), {
    discard_reason: "중복 문제",
  });
  assert.deepEqual(normalizeDiscardRequest({}), { discard_reason: null });

  const evidenceId = "11111111-1111-4111-8111-111111111111";
  const targetId = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(
    normalizeEvidenceMove({ evidence_id: evidenceId, target_candidate_id: targetId }),
    { evidence_id: evidenceId, target_candidate_id: targetId },
  );
  assert.deepEqual(normalizeMergeRequest({ target_candidate_id: targetId }), {
    target_candidate_id: targetId,
  });
  assert.throws(() => normalizeMergeRequest({ target_candidate_id: targetId, extra: true }), /Expected/);
});

test("split request requires a unique Evidence subset and complete new Candidate", () => {
  const evidenceId = "11111111-1111-4111-8111-111111111111";
  const result = normalizeSplitRequest({
    evidence_ids: [evidenceId],
    new_candidate: {
      title: "별도 배송 추적 문제",
      summary: "배송 추적 갱신 실패를 별도 문제로 분리한다.",
      intensity_level: "medium",
      repeat_pattern_level: "moderate",
      clarity_level: "clear",
    },
  });
  assert.deepEqual(result.evidence_ids, [evidenceId]);
  assert.equal(result.new_candidate.title, "별도 배송 추적 문제");

  assert.throws(
    () => normalizeSplitRequest({
      evidence_ids: [evidenceId, evidenceId],
      new_candidate: { title: "A", summary: "B" },
    }),
    /duplicates/,
  );
  assert.throws(
    () => normalizeSplitRequest({
      evidence_ids: [evidenceId],
      new_candidate: { title: "A" },
    }),
    /summary/,
  );
});
