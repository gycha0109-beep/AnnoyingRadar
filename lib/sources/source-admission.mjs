export const SOURCE_ADMISSION_VERSION = "source-admission-v0.8";
export const SOURCE_ADMISSION_DECISIONS = Object.freeze(["candidate", "review", "reject"]);

const INFORMATIONAL_TITLE = /(?:전화번호|상담원|상담시간|총정리|상황별\s*해결|해결\s*(?:방법|경로|가이드)?|체크리스트|(?:이용|사용|설치|신청|확인|조회|대응|신고)\s*(?:방법|법|가이드)|순서대로\s*대응|하는\s*법|알아보(?:기|자|겠습니다)|어떻게\s*해야\s*할까|원인(?:\s*증상)?|운동법|정리(?:해|했|합니다|하기|$)|가이드(?:\s|$)|FAQ|Q&A|법적\s*효력|청약철회(?:권)?|특약|민법|형사고소|민사소송|행정심판|신청방법|환급금\s*계산|위약금\s*\d+%|기준과|요금제\s*비교|무료\s*체험|지원금|지급\s*기준|아끼는\s*법|가능할까\?|필독|TOP\s*\d|예방법|확인해야\s*할|확인할\s*것)/i;
const COMMERCIAL_SEO_TITLE = /(?:맡길\s*일이\s*생겨서|직접\s*(?:써|사용해|먹어|가|이용해)\s*본\s*(?:솔직\s*)?후기|솔직\s*후기|후기\s*\/\s*맛추천|공구(?:\s|$)|주문\s*기간|예약\s*홈페이지|병원\s*위치|속상하신가요\?|\d+분\s*만에\s*해결|프로모션|혜택|쿠폰|할인|원가\s*양도|양도(?:합니다|해요|함)|판매(?:합니다|해요)|팝니다)/i;
const PRODUCT_PROMOTION_TITLE = /(?:제품\s*리뷰|제품리뷰|신제품|추천템|할인팁|쿠폰|특가|무료배송|이벤트|내돈내산|사용기|직접\s*써본|쇼핑리스트|맛집|마사지기|액정필름|밀키트|서큘레이터|스타일링|구매\s*(?:및|&)?\s*환불후기)/i;
const POSITIVE_REVIEW_TITLE = /(?:(?<!비)추천(?:템|합니다|해요|!)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|부담\s*없는|맛있(?:어요|습니다)?|잘\s*어울|괜찮았(?:어요|습니다)?|편했(?:어요|습니다)?)/i;
const EXPLICIT_COMPLAINT_TITLE = /(?:환불\s*(?:안\s*됨|안됨|불가|거절|거부|못\s*받|못받|지연|미처리)|취소\s*(?:당함|당했|거절|안\s*됨|안됨|불가|일방)|일방적\s*취소|(?:로그인|결제|예약|예약조회|주문|배달|호출|인증|이체)\s*(?:오류|실패|안\s*됨|안됨)|(?:오류|실패|지연|누락)\s*때문에|답(?:변)?\s*(?:없음|없다|안\s*옴|안옴)|응답\s*(?:없음|없다)|기다리다\s*(?:지침|지쳐|열받)|(?:진짜\s*|완전\s*|존나\s*)?(?:최악|비추(?:천)?)|먹튀|바가지)/i;
const COMPLAINT_TOPIC = /(?:환불|취소|오류|지연|누락|불편|귀찮|답답|짜증|최악|비추|피해|바가지|먹튀|실패|결항|최소주문|분실|도용|정지|사기|불친절|텃세|싸가지|안됨|안\s*됨|헛걸음|이용\s*불가|연락\s*두절|미발송)/i;
const EXPERIENCE_FRAMING_TITLE = /(?:후기|썰|경험|겪(?:은|어|었다|었)|당한|당했(?:다|어요|습니다|음|네요|는데|$)|했는데|하다가|문제\s*생|열받|고생|비추천|공익을\s*위해\s*남기|실제\s*(?:후기|경험)|내가|제가|나는|저는)/i;
const ACTUAL_EXPERIENCE_TITLE = /(?:실제\s*(?:후기|경험)|공익을\s*위해\s*남기)/i;
const CANDIDATE_NARRATIVE_TITLE = /(?:썰|비추천|공익을\s*위해\s*남기|내가|제가|나는|저는|겪(?:은|어|었다|었)|당했(?:다|어요|습니다|음|네요|는데|$)|당함|열받|빡(?:침|쳤|친)|고생|처음임|일방적\s*취소)/i;
const CONCRETE_COST_LOSS_TITLE = /(?:수리비|수리금액|수리견적).*?\d[\d,]*(?:\.\d+)?\s*만원.*?(?:어쩔\s*수\s*없이|결국).*?(?:새로\s*)?(?:구입|구매|교체)/i;
const LONG_WAIT_HARM_TITLE = /(?:(?:\d+\s*(?:개월|달)\s*(?:기다리(?:래|라고|게|는|라)|대기))|(?:하염없이|기약\s*없이)\s*대기)/i;
const SYSTEMIC_SERVICE_ACCESS_HARM_TITLE = /(?:때문에).*?(?:노인|고령층|장애인|어린이|아동|환자|취약계층).*?(?:못\s*(?:타|이용|받|쓰|가)|이용\s*불가|접근\s*(?:불가|어려움)|배제|소외).*?(?:현실|문제|장벽)?/i;
const WARNING_REPORT_TITLE = /(?:(?:사기|사칭|불법\s*광고|불법광고).*?(?:피해\s*주의|주의(?:하세요|해야)|속지\s*마|피해|문제)|(?:피해\s*주의|절대\s*속지\s*마))/i;
const STRONG_WARNING_REPORT_TITLE = /(?:불법\s*광고|불법광고).*?(?:절대\s*)?속지\s*마/i;
const WARNING_SHIPPING_FAILURE_SNIPPET = /(?:배송\s*(?:지연|미발송)|상품(?:을)?\s*받지\s*못)/i;
const WARNING_CONTACT_BREAKDOWN_SNIPPET = /(?:연락\s*(?:두절|회피)|상담원.*?연락.*?회피|고객센터.*?두절)/i;
const TITLE_TRUNCATED = /(?:\.{3,}|…)/;

const INFORMATIONAL_SNIPPET = /(?:정리(?:했|해|합니다)|방법(?:은|을|으로)?|이용할\s*수|문의할\s*수|확인할\s*수|공식\s*안내|목차|전화번호|상담시간|가이드|알아보겠습니다|해결(?:법|방법|경로)|청약철회|민법|법적\s*효력|신청방법|대처법|분쟁조정|신고하기|규정\s*확인|✔|체크리스트)/i;
const POSITIVE_SNIPPET = /(?:(?<!비)추천(?:합니다|해요)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|부담\s*없이|맛있(?:어요|습니다)?|괜찮았(?:어요|습니다)?)/i;
const EMPATHY_HOOK_SNIPPET = /(?:불편하셨|답답하셨|짜증나(?:셨|죠)|힘드셨|어려우셨|경험\s*(?:한\s*번쯤|있으시)|한\s*번쯤.*(?:경험|있으)|고민이라면|망설였던\s*경험|다들\s*한\s*번쯤|~?\s*셨나요\?|있으셨나요\?)/i;
const PITCH_SNIPPET = /(?:오늘\s*(?:소개|추천)|소개해\s*(?:드릴|볼게)|추천드|바로\s*(?:이|그)\s*(?:제품|서비스)|이\s*(?:제품|서비스).*?(?:장점|해결)|(?:제품|서비스)(?:를|가|이)?\s*(?:제공|소개)|사용하면|이용하면|신청하면|구매하면|오시면\s*됩니다|혜택|할인|쿠폰|특가|무료\s*체험|해결해\s*주는|진입장벽을\s*(?:낮|줄)|정답을\s*찾|드디어\s*찾)/i;
const FIRST_HAND_SNIPPET = /(?:^|[\s,.(])(?:저는|제가|저도|나는|내가|나도|내\s|제\s|우리(?:가|는)?\s)/i;
const EXPERIENCE_SNIPPET = /(?:안되더라고|안\s*되더라고|했는데|였는데|거임|사고보니|가보니|붙잡고|개빡|빡침|도랏나|눈물난다|처음임|결국|해놓고|해준다더니|해준다고|사라짐|헛걸음만\s*했|하루\s*종일|잘못해가지고|그래서\s*그냥)/i;
const HIGH_CONFIDENCE_DIRECT_HARM = [
  /환불(?:된다고|해준다고|해준다|가능하다고).*?환불\s*(?:안\s*됨|안됨|못\s*받).*?(?:담당자.*사라|연락\s*두절|전화.*싸움)/i,
  /환불(?:이)?\s*(?:안\s*됨|안됨|못\s*받).*?(?:최소\s*)?\d+\s*(?:주|달|개월).*?(?:\d[\d,]*\s*만원|기다리)/i,
  /(?:\d[\d,]*\s*만원).*?환불(?:이)?\s*(?:안\s*됨|안됨|못\s*받).*?(?:기다리|연락|두절)/i,
  /한\s*달\s*(?:넘게|이상)?.*?헛걸음/i,
];
const MODERATE_FIRST_HAND_FRICTION = [
  /주문이\s*계속\s*취소/i,
  /예약(?:조회)?(?:가|이)?\s*(?:아예\s*)?(?:안\s*되|안됨)/i,
  /끝없는\s*지연/i,
  /하루\s*종일.*?(?:전화|항공사|고객센터)/i,
  /(?:환불|취소).*?(?:안\s*됨|안됨|불가).*?(?:사고보니|잘못|안\s*팔|붙잡고)/i,
  /(?:연락|답변|응답).*?(?:두절|없|안\s*옴)/i,
];
const STRONG_SNIPPET_MARKERS = Object.freeze([
  /환불\s*(?:안\s*됨|안됨|불가|거절|거부|못|지연|미처리)/i,
  /취소\s*(?:당함|당했|거절|안\s*됨|안됨|일방)/i,
  /(?:오류|실패|지연|누락)\s*때문/i,
  /(?:답변|응답)\s*(?:없|안\s*옴)/i,
  /기다리다\s*(?:지침|지쳐|열받)/i,
  /최악/i,
  /비추천|비추/i,
  /먹튀/i,
  /바가지/i,
  /불친절/i,
  /텃세/i,
  /싸가지/i,
  /헛걸음/i,
  /연락\s*두절/i,
  /미발송/i,
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

export function classifySourceIntent(signal) {
  const title = extractSourceTitle(signal);
  const snippet = extractSourceSnippet(signal);
  const explicitComplaint = EXPLICIT_COMPLAINT_TITLE.test(title);
  const warningReport = WARNING_REPORT_TITLE.test(title);
  const systemicHarm = SYSTEMIC_SERVICE_ACCESS_HARM_TITLE.test(title);
  const promotionalTitle = COMMERCIAL_SEO_TITLE.test(title) || PRODUCT_PROMOTION_TITLE.test(title);
  const informational = INFORMATIONAL_TITLE.test(title);
  const painHookPitch = hasPainHookPitch(title, snippet);

  let intent = "unknown";
  if (painHookPitch || promotionalTitle) intent = "promotion";
  else if (warningReport) intent = "warning_report";
  else if (systemicHarm) intent = "systemic_report";
  else if (informational) intent = "guide";
  else if (EXPERIENCE_FRAMING_TITLE.test(title) || hasFirstHandFriction(snippet)) intent = "experience";

  let painRole = "ambiguous";
  if (painHookPitch) painRole = "hook";
  else if (isIncidentalParentheticalComplaint(snippet)) painRole = "incidental";
  else if (explicitComplaint || warningReport || systemicHarm || LONG_WAIT_HARM_TITLE.test(title) || hasHighConfidenceDirectHarm(snippet)) painRole = "central";

  return { intent, pain_role: painRole };
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
  const productPromotion = PRODUCT_PROMOTION_TITLE.test(title);
  const positiveReview = POSITIVE_REVIEW_TITLE.test(title);
  const explicitComplaint = EXPLICIT_COMPLAINT_TITLE.test(title);
  const complaintTopic = COMPLAINT_TOPIC.test(title);
  const experienceFraming = EXPERIENCE_FRAMING_TITLE.test(title);
  const actualExperienceTitle = ACTUAL_EXPERIENCE_TITLE.test(title);
  const candidateNarrative = CANDIDATE_NARRATIVE_TITLE.test(title);
  const concreteCostLoss = CONCRETE_COST_LOSS_TITLE.test(title);
  const longWaitHarm = LONG_WAIT_HARM_TITLE.test(title);
  const systemicServiceAccessHarm = SYSTEMIC_SERVICE_ACCESS_HARM_TITLE.test(title);
  const warningReport = WARNING_REPORT_TITLE.test(title);
  const strongWarningReport = STRONG_WARNING_REPORT_TITLE.test(title);
  const truncated = TITLE_TRUNCATED.test(title);
  const strongSnippet = hasCentralComplaintLanguage(snippet);
  const firstHandFriction = hasFirstHandFriction(snippet);
  const firstHandNarrative = FIRST_HAND_SNIPPET.test(snippet) || EXPERIENCE_SNIPPET.test(snippet);
  const highConfidenceDirectHarm = hasHighConfidenceDirectHarm(snippet);
  const moderateFirstHandFriction = hasModerateFirstHandFriction(snippet);
  const painHookPitch = hasPainHookPitch(title, snippet);

  if (painHookPitch) {
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: ["snippet_pain_hook_or_promotion"],
      requiresFullContext: false,
    });
  }

  if (productPromotion && !explicitComplaint && !warningReport) {
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: ["title_product_or_promotion"],
      requiresFullContext: false,
    });
  }

  if (warningReport) {
    const warningConcreteBreakdown = WARNING_SHIPPING_FAILURE_SNIPPET.test(snippet) && WARNING_CONTACT_BREAKDOWN_SNIPPET.test(snippet);
    if (strongWarningReport || warningConcreteBreakdown) {
      return admission({
        decision: "candidate",
        title,
        snippet,
        reasonCodes: ["title_warning_problem_complaint_central"],
        requiresFullContext: false,
      });
    }
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["title_warning_problem_requires_context"],
      requiresFullContext: true,
    });
  }

  if (informational || commercialSeo) {
    if (actualExperienceTitle && explicitComplaint && firstHandNarrative) {
      return admission({
        decision: "candidate",
        title,
        snippet,
        reasonCodes: ["title_actual_experience_complaint_central"],
        requiresFullContext: false,
      });
    }
    if (explicitComplaint && experienceFraming) {
      return admission({
        decision: "review",
        title,
        snippet,
        reasonCodes: [informational ? "title_mixed_information_and_experience" : "title_mixed_commercial_and_experience"],
        requiresFullContext: true,
      });
    }
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: [informational ? "title_information_or_guide" : "title_commercial_or_seo"],
      requiresFullContext: false,
    });
  }

  if (positiveReview) {
    if (explicitComplaint && experienceFraming) {
      return admission({
        decision: "review",
        title,
        snippet,
        reasonCodes: ["title_mixed_positive_and_complaint"],
        requiresFullContext: true,
      });
    }
    return admission({
      decision: "reject",
      title,
      snippet,
      reasonCodes: ["title_positive_review"],
      requiresFullContext: false,
    });
  }

  if (longWaitHarm) {
    return admission({
      decision: "candidate",
      title,
      snippet,
      reasonCodes: ["title_long_wait_harm_complaint_central"],
      requiresFullContext: false,
    });
  }

  if (systemicServiceAccessHarm) {
    return admission({
      decision: "candidate",
      title,
      snippet,
      reasonCodes: ["title_systemic_service_access_harm_complaint_central"],
      requiresFullContext: false,
    });
  }

  if (concreteCostLoss) {
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["title_concrete_cost_loss_requires_context"],
      requiresFullContext: true,
    });
  }

  if (explicitComplaint) {
    if (candidateNarrative || (firstHandFriction && !INFORMATIONAL_SNIPPET.test(snippet))) {
      return admission({
        decision: "candidate",
        title,
        snippet,
        reasonCodes: [candidateNarrative ? "title_explicit_personal_complaint" : "title_explicit_first_hand_complaint"],
        requiresFullContext: false,
      });
    }
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["title_explicit_complaint_requires_context"],
      requiresFullContext: true,
    });
  }

  if (isIncidentalParentheticalComplaint(snippet)) {
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["snippet_incidental_complaint_requires_context"],
      requiresFullContext: true,
    });
  }

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

  if (highConfidenceDirectHarm) {
    return admission({
      decision: "candidate",
      title,
      snippet,
      reasonCodes: ["snippet_high_confidence_direct_harm"],
      requiresFullContext: false,
    });
  }

  if (moderateFirstHandFriction) {
    return admission({
      decision: "review",
      title,
      snippet,
      reasonCodes: ["snippet_first_hand_friction_requires_context"],
      requiresFullContext: true,
    });
  }

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
  if (INFORMATIONAL_SNIPPET.test(snippet) && !hasCentralComplaintLanguage(snippet)) {
    return "snippet_information_only";
  }
  if (POSITIVE_SNIPPET.test(snippet) && !hasCentralComplaintLanguage(snippet)) {
    return "snippet_positive_context";
  }
  return null;
}

function hasPainHookPitch(title, snippet) {
  if (!snippet) return false;
  const promotionalTitle = COMMERCIAL_SEO_TITLE.test(title) || PRODUCT_PROMOTION_TITLE.test(title);
  const hook = EMPATHY_HOOK_SNIPPET.test(snippet);
  const pitch = PITCH_SNIPPET.test(snippet);
  if (promotionalTitle && (hook || pitch)) return true;
  if (!hook || !pitch) return false;
  const hookMatch = snippet.match(EMPATHY_HOOK_SNIPPET);
  const pitchMatch = snippet.match(PITCH_SNIPPET);
  if (!hookMatch || !pitchMatch) return false;
  return pitchMatch.index >= hookMatch.index && pitchMatch.index - hookMatch.index <= 320;
}

function isIncidentalParentheticalComplaint(snippet) {
  const parentheticals = [...snippet.matchAll(/\([^)]{1,180}\)/g)].map((match) => match[0]);
  if (!parentheticals.some((part) => COMPLAINT_TOPIC.test(part))) return false;
  const outside = snippet.replace(/\([^)]{1,180}\)/g, " ");
  return !COMPLAINT_TOPIC.test(outside);
}

function hasHighConfidenceDirectHarm(snippet) {
  if (!snippet) return false;
  return HIGH_CONFIDENCE_DIRECT_HARM.some((pattern) => pattern.test(snippet));
}

function hasModerateFirstHandFriction(snippet) {
  if (!snippet || hasPainHookPitch("", snippet)) return false;
  if (!hasFirstHandFriction(snippet)) return false;
  return MODERATE_FIRST_HAND_FRICTION.some((pattern) => pattern.test(snippet));
}

function hasFirstHandFriction(snippet) {
  if (!snippet) return false;
  const actorOrExperience = FIRST_HAND_SNIPPET.test(snippet) || EXPERIENCE_SNIPPET.test(snippet);
  if (!actorOrExperience) return false;
  return STRONG_SNIPPET_MARKERS.some((pattern) => pattern.test(snippet))
    || MODERATE_FIRST_HAND_FRICTION.some((pattern) => pattern.test(snippet));
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
