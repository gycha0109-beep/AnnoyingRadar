export const SOURCE_ADMISSION_VERSION = "source-admission-v0.1";
export const SOURCE_ADMISSION_DECISIONS = Object.freeze(["candidate", "review", "reject"]);

const INFORMATIONAL_TITLE = /(?:고객센터|전화번호|상담원|상담시간|총정리|상황별\s*해결|해결\s*(?:방법|경로|가이드)?|체크리스트|(?:이용|사용|설치|신청|확인|조회|대응)\s*(?:방법|법|가이드)|하는\s*법|알아보(?:기|자|겠습니다)|어떻게\s*해야\s*할까|원인\s*증상|운동법|정리(?:해|했|합니다|하기|$)|가이드(?:\s|$)|FAQ|Q&A)/i;
const POSITIVE_REVIEW_TITLE = /(?:추천(?:템|합니다|해요|!)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|부담\s*없는|맛있(?:어요|습니다)?|잘\s*어울|괜찮았(?:어요|습니다)?|편했(?:어요|습니다)?)/i;
const STRONG_COMPLAINT_TITLE = /(?:환불\s*(?:안\s*됨|안됨|불가|거절|못\s*받|못받)|취소\s*(?:당함|당했|됨|문제)|(?:로그인|결제|예약|주문|배달|호출|인증|이체)\s*(?:오류|실패|안\s*됨|안됨)|오류\s*때문에|답(?:변)?\s*(?:없음|없다|안\s*옴|안옴)|응답\s*(?:없음|없다)|기다리다\s*(?:지침|지쳐|열받)|최악|비추|먹튀|바가지|피해\s*(?:봄|봤|사례)|사기|불친절|텃세|싸가지|누락|분실|도용|계좌\s*정지)/i;
const TITLE_TRUNCATED = /(?:\.{3,}|…)/;

export function normalizeSourceTitle(value) {
  if (typeof value !== "string") return "";
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSourceTitle(signal) {
  const providerTitle = normalizeSourceTitle(signal?.source_metadata?.provider_title);
  if (providerTitle) return providerTitle;
  const rawText = String(signal?.raw_text ?? "").trim();
  if (!rawText) return "";
  return normalizeSourceTitle(rawText.split(/\n\s*\n|\n/)[0]);
}

export function classifySourceAdmission(signal) {
  if (signal?.source_platform !== "naver_blog") {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "candidate",
      title: extractSourceTitle(signal),
      reason_codes: ["non_naver_source_preserved"],
      requires_full_context: false,
    };
  }

  const title = extractSourceTitle(signal);
  if (!title) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "review",
      title: "",
      reason_codes: ["missing_title"],
      requires_full_context: true,
    };
  }

  const informational = INFORMATIONAL_TITLE.test(title);
  const positiveReview = POSITIVE_REVIEW_TITLE.test(title);
  const strongComplaint = STRONG_COMPLAINT_TITLE.test(title);
  const truncated = TITLE_TRUNCATED.test(title);

  // Source intent outranks retrieval snippets. A how-to/SEO/guide title is not
  // promoted to complaint merely because NAVER selected a pain phrase in description.
  if (informational) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "reject",
      title,
      reason_codes: ["title_information_or_guide"],
      requires_full_context: false,
    };
  }

  // Positive framing is likewise a source-level rejection unless the title also
  // contains an explicit complaint event, in which case a human/context review wins.
  if (positiveReview && !strongComplaint) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "reject",
      title,
      reason_codes: ["title_positive_review"],
      requires_full_context: false,
    };
  }
  if (positiveReview && strongComplaint) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "review",
      title,
      reason_codes: ["title_mixed_positive_and_complaint"],
      requires_full_context: true,
    };
  }

  if (strongComplaint) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "candidate",
      title,
      reason_codes: ["title_explicit_complaint"],
      requires_full_context: false,
    };
  }

  if (truncated) {
    return {
      version: SOURCE_ADMISSION_VERSION,
      decision: "review",
      title,
      reason_codes: ["title_truncated"],
      requires_full_context: true,
    };
  }

  // Critical invariant: snippet text alone can never promote a NAVER Blog result.
  // Unclear titles remain review candidates for selective canonical-page inspection.
  return {
    version: SOURCE_ADMISSION_VERSION,
    decision: "review",
    title,
    reason_codes: ["title_not_complaint_central"],
    requires_full_context: true,
  };
}

export function summarizeSourceAdmissions(signals) {
  const summary = { total: 0, candidate: 0, review: 0, reject: 0, full_context_required: 0 };
  for (const signal of signals ?? []) {
    const admission = classifySourceAdmission(signal);
    summary.total += 1;
    summary[admission.decision] += 1;
    if (admission.requires_full_context) summary.full_context_required += 1;
  }
  return summary;
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}
