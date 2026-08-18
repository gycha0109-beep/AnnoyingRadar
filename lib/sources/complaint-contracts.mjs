export const COMPLAINT_GOLD_SET_VERSION = "gold-v0.1";
export const COMPLAINT_CLASSIFIER_VERSION = "complaint-gate-v0.1";
export const COMPLAINT_PREFILTER_VERSION = "complaint-prefilter-v0.1";
export const COMPLAINT_PROMPT_VERSION = "complaint-relevance-v0.1";

export const TRI_STATE_VALUES = Object.freeze(["yes", "no", "uncertain"]);
export const COMPLAINT_DECISIONS = Object.freeze(["pass", "review", "reject"]);
export const PREFILTER_DECISIONS = Object.freeze(["continue", "review", "reject"]);

export const COMPLAINT_REASON_CODES = Object.freeze([
  "first_hand_concrete_friction",
  "not_first_hand",
  "no_concrete_friction",
  "generic_negative_only",
  "spam_or_ad",
  "repost_or_copy",
  "news_or_information_only",
  "preference_only",
  "positive_or_neutral_review",
  "insufficient_context",
  "link_only_or_no_claim",
  "other",
]);

const TRI_STATE = new Set(TRI_STATE_VALUES);
const GOLD_KEYS = new Set([
  "complaint_relevant",
  "first_hand_experience",
  "concrete_friction",
  "spam_or_ad",
  "repost_or_copy",
  "news_only",
  "generic_negative_only",
  "core_evidence",
  "annotator_note",
]);

const URL_ONLY = /^\s*(?:https?:\/\/\S+\s*)+$/i;
const GENERIC_NEGATIVE = /^(?:진짜\s*)?(?:짜증|짜증나|빡침|빡친다|별로|최악|개망|망했네|싫다|노답|ugh|annoying|this sucks|hate it|terrible)[.!?ㅋㅎ\s]*$/i;
const PROMO_MARKERS = /(?:#광고|#협찬|광고입니다|협찬받|할인코드|쿠폰코드|프로모션\s*코드|sponsored|ad\s*[:：]|promo\s*code|discount\s*code)/i;
const NEWS_MARKERS = /(?:^|\s)(?:속보|단독|뉴스|breaking\s+news|reportedly|according\s+to\s+(?:reports?|news))/i;

export class ComplaintContractError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "ComplaintContractError";
    this.code = code;
    this.status = status;
  }
}

export function runDeterministicComplaintPrefilter(signal) {
  const rawText = String(signal?.raw_text ?? "").trim();
  const reasons = [];

  if (!rawText || URL_ONLY.test(rawText)) {
    return {
      decision: "reject",
      reason_codes: ["link_only_or_no_claim"],
    };
  }

  if (PROMO_MARKERS.test(rawText)) reasons.push("spam_or_ad");
  if (NEWS_MARKERS.test(rawText)) reasons.push("news_or_information_only");
  if (GENERIC_NEGATIVE.test(rawText)) reasons.push("generic_negative_only");

  if (reasons.length > 0) {
    return { decision: "review", reason_codes: [...new Set(reasons)] };
  }

  return { decision: "continue", reason_codes: [] };
}

export function deriveComplaintDecision({
  complaint_relevant,
  first_hand_experience,
  concrete_friction,
}) {
  for (const [field, value] of Object.entries({
    complaint_relevant,
    first_hand_experience,
    concrete_friction,
  })) {
    if (!TRI_STATE.has(value)) {
      throw new ComplaintContractError(
        "invalid_complaint_dimension",
        `${field} must be yes, no, or uncertain`,
        { status: 502 },
      );
    }
  }

  if (
    complaint_relevant === "yes"
    && first_hand_experience === "yes"
    && concrete_friction === "yes"
  ) return "pass";

  if (
    complaint_relevant === "no"
    || first_hand_experience === "no"
    || concrete_friction === "no"
  ) return "reject";

  return "review";
}

export function normalizeGoldAnnotationInput(value, rawText = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ComplaintContractError("invalid_gold_annotation", "Gold annotation body must be an object");
  }

  const unknown = Object.keys(value).find((key) => !GOLD_KEYS.has(key));
  if (unknown) {
    throw new ComplaintContractError("invalid_gold_annotation", `Unsupported Gold annotation field: ${unknown}`);
  }

  const complaintRelevant = triState(value.complaint_relevant, "complaint_relevant");
  const firstHand = triState(value.first_hand_experience, "first_hand_experience");
  const concreteFriction = triState(value.concrete_friction, "concrete_friction");
  const coreEvidence = optionalString(value.core_evidence, "core_evidence", 2000);
  const annotatorNote = optionalString(value.annotator_note, "annotator_note", 4000);

  if (complaintRelevant === "yes") {
    if (firstHand !== "yes" || concreteFriction !== "yes") {
      throw new ComplaintContractError(
        "invalid_gold_positive",
        "complaint_relevant=yes requires first_hand_experience=yes and concrete_friction=yes",
      );
    }
    if (!coreEvidence) {
      throw new ComplaintContractError(
        "invalid_gold_positive",
        "complaint_relevant=yes requires core_evidence",
      );
    }
  }

  if (coreEvidence && typeof rawText === "string" && !rawText.includes(coreEvidence)) {
    throw new ComplaintContractError(
      "invalid_gold_evidence",
      "core_evidence must be an exact contiguous excerpt from the Source Signal",
    );
  }

  return {
    complaint_relevant: complaintRelevant,
    first_hand_experience: firstHand,
    concrete_friction: concreteFriction,
    spam_or_ad: Boolean(value.spam_or_ad),
    repost_or_copy: Boolean(value.repost_or_copy),
    news_only: Boolean(value.news_only),
    generic_negative_only: Boolean(value.generic_negative_only),
    core_evidence: coreEvidence,
    annotator_note: annotatorNote,
  };
}

function triState(value, fieldName) {
  if (!TRI_STATE.has(value)) {
    throw new ComplaintContractError(
      "invalid_gold_annotation",
      `${fieldName} must be yes, no, or uncertain`,
    );
  }
  return value;
}

function optionalString(value, fieldName, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ComplaintContractError(
      "invalid_gold_annotation",
      `${fieldName} must be null or a string of at most ${maxLength} characters`,
    );
  }
  return value.trim() || null;
}
