export const SOURCE_ADMISSION_VERSION = "source-admission-v0.3";
export const SOURCE_ADMISSION_DECISIONS = Object.freeze(["candidate", "review", "reject"]);

const INFORMATIONAL_TITLE = /(?:전화번호|상담원|상담시간|총정리|상황별\s*해결|해결\s*(?:방법|경로|가이드)?|체크리스트|(?:이용|사용|설치|신청|확인|조회|대응)\s*(?:방법|법|가이드)|하는\s*법|알아보(?:기|자|겠습니다)|어떻게\s*해야\s*할까|원인\s*증상|운동법|정리(?:해|했|합니다|하기|$)|가이드(?:\s|$)|FAQ|Q&A)/i;
const COMMERCIAL_SEO_TITLE = /(?:맡길\s*일이\s*생겨서|직접\s*(?:써|사용해|먹어|가|이용해)\s*본\s*(?:솔직\s*)?후기|솔직\s*후기|후기\s*\/\s*맛추천|공구(?:\s|$)|주문\s*기간|예약\s*홈페이지|병원\s*위치|방문\s*전|미리\s*알아보)/i;
const POSITIVE_REVIEW_TITLE = /(?:추천(?:템|합니다|해요|!)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|부담\s*없는|맛있(?:어요|습니다)?|잘\s*어울|괜찮았(?:어요|습니다)?|편했(?:어요|습니다)?)/i;
const EXPLICIT_COMPLAINT_TITLE = /(?:환불\s*(?:안\s*됨|안됨|불가|거절|못\s*받|못받)|취소\s*(?:당함|당했|거절|안\s*됨|안됨)|(?:로그인|결제|예약|주문|배달|호출|인증|이체)\s*(?:오류|실패|안\s*됨|안됨)|(?:오류|실패|지연|누락)\s*때문에|답(?:변)?\s*(?:없음|없다|안\s*옴|안옴)|응답\s*(?:없음|없다)|기다리다\s*(?:지침|지쳐|열받)|(?:진짜\s*|완전\s*|존나\s*)?(?:최악|비추)|먹튀|바가지)/i;
const COMPLAINT_TOPIC = /(?:환불|취소|오류|지연|누락|불편|귀찮|답답|짜증|최악|비추|피해|바가지|먹튀|실패|결항|최소주문|분실|도용|정지|사기|불친절|텃세|싸가지)/i;
const EXPERIENCE_FRAMING_TITLE = /(?:후기|썰|경험|겪(?:은|어|었다|었)|당한|당했|했는데|하다가|문제\s*생|열받|고생|비추)/i;
const TITLE_TRUNCATED = /(?:\.{3,}|…)/;

const INFORMATIONAL_SNIPPET = /(?:정리(?:했|해|합니다)|방법(?:은|을|으로)?|이용할\s*수|문의할\s*수|확인할\s*수|공식\s*안내|목차|전화번호|상담시간|가이드|알아보겠습니다|해결(?:법|방법|경로))/i;
const POSITIVE_SNIPPET = /(?:추천(?:합니다|해요)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|부담\s*없이|맛있(?:어요|습니다)?|괜찮았(?:어요|습니다)?)/i;
const STRONG_SNIPPET_MARKERS = Object.freeze([
  /환불\s*(?:안\s*됨|안됨|불가|거절|못|받음|받았)/i,
  /취소\s*(?:당함|당했|거절|안\s*됨|안됨)/i,
  /(?:오류|실패|지연|누락)\s*때문/i,
  /(?:답변|응답)\s*(?:없|안\s*옴)/i,
  /기다리다\s*(?:지침|지쳐|열받)/i,
  /최악/i,
  /비추/i,
  /먹튀/i,
  /바가지/i,
  /불친절/i,
  /텃세/i,
  /싸가지/i,
]);

export function normalizeSourceText(value) {
  if (typeof value !== "string") return "";
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export const normalizeSourceTitle = normalizeSourceText;

export function extractSourceTitle(signal) {
  const providerTitle = normalizeSourceTitle(signal?.source_metadata?.provider_title);
  if (providerTitle) return providerTitle;
  const rawText = String(signal?.raw_text ?? "").trim();
  if (!rawText) return "";
  return normalizeSourceTitle(rawText.split(/\n\s*\n|\n/)[0]);
}

export function extractSourceSnippet(signal) {
  const providerDescription = normalizeSourceText(signal?.source_metadata?.provider_description);
  if (providerDescription) return providerDescription;
  const rawText = String(signal?.raw_text ?? "").trim();
  if (!rawText) return "";
  const parts = rawText.split(/\n\s*\n/);
  return normalizeSourceText(parts.slice(1).join(" "));
}

export function classifySourceAdmission(signal) {
  if (signal?.source_platform !== "naver_blog") {
    return admission({
      decision: "candidate",
      title: extractSourceTitle(signal),
      snippet: extractSourceSnippet(signal),
      reasonCodes: ["non_naver_source_preserved"],
      requiresFullContext: false,
    });
  }

  const title = extractSourceTitle(signal);
  const snippet = extractSourceSnippet(signal);
  if (!title) {
    return admission({
      decision: "review",
      title: "",
      snippet,
      reasonCodes: ["missing_title"],
      requiresFullContext: true,
    });
  }

  const informational = INFORMATIONAL_TITLE.test(title);
  const commercialSeo = COMMERCIAL_SEO_TITLE.test(title);
  const positiveReview = POSITIVE_REVIEW_TITLE.test(title);
  const explicitComplaint = EXPLICIT_COMPLAINT_TITLE.test(title);
  const complaintTopic = COMPLAINT_TOPIC.test(title);
  const experienceFraming = EXPERIENCE_FRAMING_TITLE.test(title);
  const truncated = TITLE_TRUNCATED.test(title);

  if (informational) {
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: ["title_information_or_guide"],
      requiresFullContext: false,
    });
  }

  if (commercialSeo || positiveReview) {
    if (explicitComplaint) {
      return admission({
        decision: "review",
        title,
        snippet,
        reasonCodes: [commercialSeo ? "title_mixed_commercial_and_complaint" : "title_mixed_positive_and_complaint"],
        requiresFullContext: true,
      });
    }
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: [commercialSeo ? "title_commercial_or_seo" : "title_positive_review"],
      requiresFullContext: false,
    });
  }

  // Candidate is intentionally narrow. Generic topic nouns such as 사기, 피해,
  // 분실, 도용, 정지는 never sufficient on their own.
  if (explicitComplaint) {
    return admission({
      decision: "candidate",
      title,
      snippet,
      reasonCodes: ["title_explicit_complaint"],
      requiresFullContext: false,
    });
  }

  // Search snippets may only demote. They never create a candidate.
  const snippetDemotion = classifySnippetDemotion(snippet);
  if (snippetDemotion) {
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: [snippetDemotion],
      requiresFullContext: false,
    });
  }

  const strongSnippet = hasCentralComplaintLanguage(snippet);

  // Truncation alone is not review-worthy. A truncated title must still show either
  // complaint + experience framing, or be backed by multiple independent complaint
  // markers in the retrieval snippet.
  if (truncated) {
    if (complaintTopic && (experienceFraming || strongSnippet)) {
      return admission({
        decision: "review",
        title,
        snippet,
        reasonCodes: ["title_truncated_complaint_ambiguous"],
        requiresFullContext: true,
      });
    }
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: [complaintTopic ? "title_truncated_topic_without_event" : "title_truncated_no_complaint_signal"],
      requiresFullContext: false,
    });
  }

  // A complaint topic reaches REVIEW only when the title looks experience-oriented
  // or the snippet contains multiple independent complaint markers. This prevents
  // query-shaped/SEO titles from flooding the full-context queue.
  if (complaintTopic) {
    if (experienceFraming || strongSnippet) {
      return admission({
        decision: "review",
        title,
        snippet,
        reasonCodes: [experienceFraming ? "title_complaint_experience_ambiguous" : "snippet_strong_complaint_requires_context"],
        requiresFullContext: true,
      });
    }
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: ["title_topic_without_event"],
      requiresFullContext: false,
    });
  }

  // Neutral/opaque titles only receive review capacity when the snippet is strongly
  // complaint-heavy. This preserves cases such as `벼락치기` without allowing a
  // single query-matched pain phrase to dominate source admission.
  if (strongSnippet) {
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["snippet_strong_complaint_requires_context"],
      requiresFullContext: true,
    });
  }

  return admission({
    decision: "reject",
    title,
    snippet,
    reasonCodes: ["title_no_complaint_signal"],
    requiresFullContext: false,
  });
}

export function summarizeSourceAdmissions(signals) {
  const summary = { total: 0, candidate: 0, review: 0, reject: 0, full_context_required: 0 };
  for (const signal of signals ?? []) {
    const result = classifySourceAdmission(signal);
    summary.total += 1;
    summary[result.decision] += 1;
    if (result.requires_full_context) summary.full_context_required += 1;
  }
  return summary;
}

function classifySnippetDemotion(snippet) {
  if (!snippet) return null;
  if (isIncidentalParentheticalComplaint(snippet)) return "snippet_incidental_complaint_only";
  if (INFORMATIONAL_SNIPPET.test(snippet) && !hasCentralComplaintLanguage(snippet)) {
    return "snippet_information_only";
  }
  if (POSITIVE_SNIPPET.test(snippet) && !hasCentralComplaintLanguage(snippet)) {
    return "snippet_positive_context";
  }
  return null;
}

function isIncidentalParentheticalComplaint(snippet) {
  const parentheticals = [...snippet.matchAll(/\([^)]{1,180}\)/g)].map((match) => match[0]);
  if (!parentheticals.some((part) => COMPLAINT_TOPIC.test(part))) return false;
  const outside = snippet.replace(/\([^)]{1,180}\)/g, " ");
  return !COMPLAINT_TOPIC.test(outside);
}

function hasCentralComplaintLanguage(snippet) {
  if (!snippet) return false;
  const complaintHits = STRONG_SNIPPET_MARKERS.filter((pattern) => pattern.test(snippet)).length;
  return complaintHits >= 2;
}

function admission({ decision, title, snippet, reasonCodes, requiresFullContext }) {
  return {
    version: SOURCE_ADMISSION_VERSION,
    decision,
    title,
    snippet,
    reason_codes: reasonCodes,
    requires_full_context: requiresFullContext,
  };
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
