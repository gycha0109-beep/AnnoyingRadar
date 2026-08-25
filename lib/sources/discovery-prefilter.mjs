export const DISCOVERY_PREFILTER_VERSION = "source-discovery-prefilter-v0.1";
export const DISCOVERY_DECISIONS = Object.freeze(["continue", "reject"]);

const STRONG_GUIDE_TITLE = /(?:전화번호|상담시간|총정리|해결\s*(?:방법|가이드)|체크리스트|신청\s*(?:방법|가이드)|신고\s*(?:방법|가이드)|하는\s*법|정리(?:해|했|합니다|하기|$)|가이드(?:\s|$)|FAQ|Q&A|법적\s*효력|청약철회|환급금\s*계산|위약금\s*\d+%|요금제\s*비교|아끼는\s*법|예방법)/i;
const STRONG_COMMERCIAL_TITLE = /(?:공구(?:\s|$)|공동구매|예약\s*홈페이지|프로모션|혜택|쿠폰|할인|특가|무료배송|이벤트|추천템|쇼핑리스트|맛집|신제품)/i;
const SALES_LISTING = /(?:원가\s*양도|양도(?:합니다|해요|함)|판매(?:합니다|해요|함)|팝니다|삽니다|구매\s*링크)/i;
const POSITIVE_ONLY = /(?:(?<!비)추천(?:합니다|해요|!)?|만족|좋았(?:어요|습니다)?|깔끔했(?:어요|습니다)?|맛있(?:어요|습니다)?|편했(?:어요|습니다)?|괜찮았(?:어요|습니다)?)/i;
const FIRST_HAND_OR_NARRATIVE = /(?:저는|제가|저도|나는|내가|나도|실제\s*(?:후기|경험)|후기|썰|겪(?:은|어|었다|었)|당했(?:다|어요|습니다|음|네요|는데)|했는데|하다가|해보니|가보니|문의했|전화했|기다렸|고생|열받|빡침|결국|처음임)/i;
const STRONG_FRICTION = /(?:환불\s*(?:안\s*됨|안됨|불가|거절|거부|못\s*받|못받|지연|미처리)|취소\s*(?:당함|당했|거절|안\s*됨|안됨|불가|일방)|일방적\s*취소|(?:로그인|결제|예약|예약조회|주문|배달|호출|인증|이체)\s*(?:오류|실패|안\s*됨|안됨)|(?:오류|실패|지연|누락)\s*때문에|답(?:변)?\s*(?:없음|없다|안\s*옴|안옴)|응답\s*(?:없음|없다)|연락\s*(?:두절|안\s*됨|안됨)|먹튀|바가지|헛걸음|미발송|강제집행|내용증명|민원\s*(?:신고|접수))/i;
const BROAD_FRICTION = /(?:환불|취소|오류|지연|누락|불편|귀찮|답답|짜증|최악|비추|피해|바가지|먹튀|실패|결항|최소주문|분실|도용|정지|불친절|안됨|안\s*됨|헛걸음|이용\s*불가|연락\s*두절|미발송|고장|파손|불량|거절|거부)/i;

function normalize(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function signalText(signal) {
  const title = normalize(signal?.source_metadata?.provider_title)
    || normalize(signal?.raw_text?.split("\n")[0]);
  const raw = normalize(signal?.raw_text);
  return { title, raw, combined: `${title}\n${raw}`.trim() };
}

function result(decision, reasonCodes = []) {
  return {
    version: DISCOVERY_PREFILTER_VERSION,
    decision,
    reason_codes: reasonCodes,
    authority: "high_recall_hard_reject_only",
  };
}

export function classifyDiscoverySignal(signal) {
  const { title, raw, combined } = signalText(signal);
  if (!raw) return result("reject", ["no_search_text"]);

  const firstHand = FIRST_HAND_OR_NARRATIVE.test(combined);
  const strongFriction = STRONG_FRICTION.test(combined);
  const broadFriction = BROAD_FRICTION.test(combined);

  // High-recall invariant: lived or strongly explicit friction always survives.
  if (firstHand || strongFriction) return result("continue");

  if (SALES_LISTING.test(title)) return result("reject", ["obvious_sales_listing"]);
  if (STRONG_GUIDE_TITLE.test(title)) return result("reject", ["obvious_informational_guide"]);
  if (STRONG_COMMERCIAL_TITLE.test(title) && !broadFriction) {
    return result("reject", ["obvious_commercial_content"]);
  }
  if (POSITIVE_ONLY.test(combined) && !broadFriction) {
    return result("reject", ["positive_content_without_friction"]);
  }

  // Ambiguity is retained; Source Admission remains the precision authority.
  return result("continue");
}

export function filterDiscoverySignals(signals) {
  const accepted = [];
  const rejected = [];
  const reasonCounts = {};

  for (const [index, signal] of (signals ?? []).entries()) {
    const classification = classifyDiscoverySignal(signal);
    if (classification.decision === "continue") {
      accepted.push(signal);
      continue;
    }

    for (const reason of classification.reason_codes) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
    rejected.push({
      index,
      source_platform: signal?.source_platform ?? null,
      external_content_id: signal?.external_content_id ?? null,
      reason_codes: classification.reason_codes,
    });
  }

  return {
    version: DISCOVERY_PREFILTER_VERSION,
    accepted,
    rejected,
    summary: {
      total: (signals ?? []).length,
      continue_count: accepted.length,
      reject_count: rejected.length,
      reason_counts: reasonCounts,
    },
  };
}
