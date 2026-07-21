import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_RAW_TEXT_LENGTH,
  apiErrorMessage,
  buildRawInputPayload,
  hasRawInputChanges,
  rawInputFormFromRecord,
  rawInputPreview,
  sourceTypeLabel,
} from "../lib/raw-inputs/presentation.mjs";

test("buildRawInputPayload preserves raw text and normalizes optional fields", () => {
  assert.deepEqual(
    buildRawInputPayload({
      raw_text: "  배송이 너무 늦습니다.  ",
      source_type: "review",
      source_url: "  https://example.com/review  ",
      source_memo: "   ",
      language: "ko",
    }),
    {
      raw_text: "  배송이 너무 늦습니다.  ",
      source_type: "review",
      source_url: "https://example.com/review",
      source_memo: null,
      language: "ko",
    },
  );
});

test("buildRawInputPayload rejects empty and oversized raw text", () => {
  assert.throws(
    () => buildRawInputPayload({ raw_text: "   " }),
    /분석할 원문을 입력해 주세요/,
  );

  assert.throws(
    () => buildRawInputPayload({ raw_text: "가".repeat(MAX_RAW_TEXT_LENGTH + 1) }),
    /200,000자까지/,
  );
});

test("rawInputPreview normalizes whitespace and limits length", () => {
  assert.equal(rawInputPreview("배송이\n\n너무   늦습니다.", 20), "배송이 너무 늦습니다.");
  assert.equal(rawInputPreview("1234567890", 6), "12345…");
});

test("sourceTypeLabel returns known labels and preserves unknown values", () => {
  assert.equal(sourceTypeLabel("community"), "커뮤니티");
  assert.equal(sourceTypeLabel("custom-source"), "custom-source");
  assert.equal(sourceTypeLabel(null), "출처 미지정");
});

test("form conversion preserves nullable metadata without inventing values", () => {
  const record = {
    raw_text: "원문",
    source_type: null,
    source_url: null,
    source_memo: "메모",
    language: null,
  };
  const form = rawInputFormFromRecord(record);

  assert.deepEqual(form, {
    raw_text: "원문",
    source_type: "",
    source_url: "",
    source_memo: "메모",
    language: "",
  });
  assert.equal(hasRawInputChanges(record, form), false);
  assert.equal(hasRawInputChanges(record, { ...form, source_memo: "수정" }), true);
});

test("apiErrorMessage prefers the server error contract", () => {
  assert.equal(
    apiErrorMessage({ error: { message: "confirmed candidate exists" } }, "fallback"),
    "confirmed candidate exists",
  );
  assert.equal(apiErrorMessage({}, "fallback"), "fallback");
});
