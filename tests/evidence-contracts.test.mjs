import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicEvidenceFixture,
  normalizeEvidenceDecision,
  normalizeEvidenceUpdates,
} from "../lib/evidence/contracts.mjs";

test("deterministic fixture splits source text without inventing quotes", () => {
  const fixture = buildDeterministicEvidenceFixture(
    "배송이 너무 늦습니다. 상담원마다 답변이 다릅니다.\n환불도 오래 걸립니다.",
  );

  assert.equal(fixture.length, 3);
  assert.deepEqual(
    fixture.map((item) => item.original_text),
    ["배송이 너무 늦습니다.", "상담원마다 답변이 다릅니다.", "환불도 오래 걸립니다."],
  );
  assert.ok(fixture.every((item) => item.sentiment_level === "unknown"));
});

test("fixture rejects empty raw text", () => {
  assert.throws(() => buildDeterministicEvidenceFixture("  "), /원문이 비어/);
});

test("Evidence updates reject unknown fields and invalid levels", () => {
  assert.throws(
    () => normalizeEvidenceUpdates([{ id: "e1", original_text: "변조" }]),
    /수정할 수 없습니다/,
  );
  assert.throws(
    () => normalizeEvidenceUpdates([{ id: "e1", intensity_level: "extreme" }]),
    /올바르지 않습니다/,
  );
});

test("Evidence decision requires disjoint unique confirmed ids", () => {
  assert.deepEqual(
    normalizeEvidenceDecision({
      confirmed_evidence_ids: ["a", "b"],
      deleted_evidence_ids: ["c"],
    }),
    {
      confirmed_evidence_ids: ["a", "b"],
      deleted_evidence_ids: ["c"],
    },
  );

  assert.throws(
    () => normalizeEvidenceDecision({ confirmed_evidence_ids: [], deleted_evidence_ids: [] }),
    /1개 이상/,
  );
  assert.throws(
    () => normalizeEvidenceDecision({ confirmed_evidence_ids: ["a"], deleted_evidence_ids: ["a"] }),
    /동시에 포함/,
  );
  assert.throws(
    () => normalizeEvidenceDecision({ confirmed_evidence_ids: ["a", "a"] }),
    /중복 ID/,
  );
});
