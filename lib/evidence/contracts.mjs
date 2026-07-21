export const EVIDENCE_SELECT = [
  "id",
  "user_id",
  "raw_input_id",
  "original_text",
  "summary_ko",
  "pain_type",
  "target_user",
  "situation",
  "sentiment_level",
  "intensity_level",
  "source_type",
  "source_url",
  "source_memo",
  "status",
  "order_index",
  "created_at",
  "updated_at",
].join(", ");

export const SENTIMENT_LEVELS = new Set(["negative", "mixed", "neutral", "unknown"]);
export const INTENSITY_LEVELS = new Set(["low", "medium", "high", "unknown"]);
export const EDITABLE_EVIDENCE_FIELDS = new Set([
  "summary_ko",
  "pain_type",
  "target_user",
  "situation",
  "sentiment_level",
  "intensity_level",
  "status",
  "order_index",
]);

export function buildDeterministicEvidenceFixture(rawText) {
  const normalized = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error("Raw Input 원문이 비어 있습니다.");
  }

  const segments = normalized
    .split(/(?:\n+|(?<=[.!?。！？])\s+)/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 5);

  return (segments.length > 0 ? segments : [normalized]).map((originalText) => ({
    original_text: originalText,
    summary_ko: originalText,
    pain_type: "unspecified",
    target_user: null,
    situation: null,
    sentiment_level: "unknown",
    intensity_level: "unknown",
  }));
}

export function normalizeEvidenceUpdates(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("updates는 1개 이상 50개 이하의 배열이어야 합니다.");
  }

  return value.map((update) => {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("각 Evidence 수정 항목은 객체여야 합니다.");
    }

    if (typeof update.id !== "string" || !update.id.trim()) {
      throw new Error("각 Evidence 수정 항목에는 id가 필요합니다.");
    }

    const unknownField = Object.keys(update).find(
      (fieldName) => fieldName !== "id" && !EDITABLE_EVIDENCE_FIELDS.has(fieldName),
    );
    if (unknownField) {
      throw new Error(`${unknownField} 필드는 수정할 수 없습니다.`);
    }

    if ("status" in update && !["draft", "deleted"].includes(update.status)) {
      throw new Error("개별 수정의 status는 draft 또는 deleted만 허용됩니다.");
    }

    if ("sentiment_level" in update && update.sentiment_level !== null && !SENTIMENT_LEVELS.has(update.sentiment_level)) {
      throw new Error("sentiment_level 값이 올바르지 않습니다.");
    }

    if ("intensity_level" in update && update.intensity_level !== null && !INTENSITY_LEVELS.has(update.intensity_level)) {
      throw new Error("intensity_level 값이 올바르지 않습니다.");
    }

    if ("order_index" in update && (!Number.isInteger(update.order_index) || update.order_index < 0)) {
      throw new Error("order_index는 0 이상의 정수여야 합니다.");
    }

    return update;
  });
}

export function normalizeEvidenceDecision(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("JSON object body가 필요합니다.");
  }

  const confirmed = uniqueStringArray(body.confirmed_evidence_ids, "confirmed_evidence_ids");
  const deleted = uniqueStringArray(body.deleted_evidence_ids ?? [], "deleted_evidence_ids");

  if (confirmed.length < 1) {
    throw new Error("확정 Evidence를 1개 이상 선택해야 합니다.");
  }

  const deletedSet = new Set(deleted);
  if (confirmed.some((id) => deletedSet.has(id))) {
    throw new Error("같은 Evidence를 확정과 삭제에 동시에 포함할 수 없습니다.");
  }

  return {
    confirmed_evidence_ids: confirmed,
    deleted_evidence_ids: deleted,
  };
}

function uniqueStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName}는 배열이어야 합니다.`);
  }

  const normalized = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${fieldName}에는 문자열 ID만 사용할 수 있습니다.`);
    }
    return item.trim();
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${fieldName}에 중복 ID가 있습니다.`);
  }

  return normalized;
}
