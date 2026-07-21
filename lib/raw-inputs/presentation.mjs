export const MAX_RAW_TEXT_LENGTH = 200000;

const SOURCE_LABELS = {
  manual: "직접 입력",
  review: "리뷰",
  community: "커뮤니티",
  interview: "인터뷰",
  other: "기타",
};

export function buildRawInputPayload(form) {
  const rawText = String(form.raw_text ?? "");

  if (rawText.trim().length === 0) {
    throw new Error("분석할 원문을 입력해 주세요.");
  }

  if (rawText.length > MAX_RAW_TEXT_LENGTH) {
    throw new Error(`원문은 ${MAX_RAW_TEXT_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`);
  }

  return {
    raw_text: rawText,
    source_type: nullableString(form.source_type),
    source_url: nullableString(form.source_url),
    source_memo: nullableString(form.source_memo),
    language: nullableString(form.language),
  };
}

export function rawInputPreview(value, maximumLength = 96) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maximumLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

export function sourceTypeLabel(value) {
  if (!value) {
    return "출처 미지정";
  }

  return SOURCE_LABELS[value] ?? value;
}

export function formatUpdatedAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "시간 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function apiErrorMessage(payload, fallbackMessage) {
  const message = payload?.error?.message;
  return typeof message === "string" && message.trim() ? message : fallbackMessage;
}

export function rawInputFormFromRecord(rawInput) {
  return {
    raw_text: rawInput?.raw_text ?? "",
    source_type: rawInput?.source_type ?? "manual",
    source_url: rawInput?.source_url ?? "",
    source_memo: rawInput?.source_memo ?? "",
    language: rawInput?.language ?? "ko",
  };
}

export function hasRawInputChanges(currentRawInput, form) {
  if (!currentRawInput) {
    return false;
  }

  const baseline = rawInputFormFromRecord(currentRawInput);

  return Object.keys(baseline).some((key) => baseline[key] !== form[key]);
}

function nullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
