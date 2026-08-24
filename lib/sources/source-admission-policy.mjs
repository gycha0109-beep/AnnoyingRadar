import {
  classifyPainOwnership,
  classifySourceAdmission as classifyBaseSourceAdmission,
  classifySourceIntent as classifyBaseSourceIntent,
  extractSourceSnippet,
  extractSourceTitle,
  normalizeSourceText,
  normalizeSourceTitle,
  PAIN_OWNERSHIP_VERSION,
  SOURCE_ADMISSION_DECISIONS,
  SOURCE_ADMISSION_VERSION,
} from "./source-admission.mjs";

export {
  classifyPainOwnership,
  extractSourceSnippet,
  extractSourceTitle,
  normalizeSourceText,
  normalizeSourceTitle,
  PAIN_OWNERSHIP_VERSION,
  SOURCE_ADMISSION_DECISIONS,
  SOURCE_ADMISSION_VERSION,
};

export const SOURCE_CAUSALITY_VERSION = "source-causality-v0.1";
export const SOURCE_RECOVERY_VERSION = "source-recovery-v0.1";
export const SOURCE_ADMISSION_POLICY_REVISION = "source-admission-v0.8-pain-ownership-v0.1-causality-v0.1-recovery-v0.1";

const SELF_CAUSED_MISTAKE_PATTERNS = Object.freeze([
  /(?:뭘|뭔가|제가|내가|우리가)?\s*잘못해(?:가지고|서).*?(?:예약|티켓|표|주문).*?(?:안\s*됨|안됨|실패|불가)/i,
  /(?:깜빡|까먹).*?(?:무료|연령|조건|티켓|표).*?(?:사서|샀|구매|예매).*?(?:환불\s*(?:안\s*됨|안됨|불가)|취소\s*불가)/i,
  /(?:사고보니|예매하고\s*보니|예약하고\s*보니).*?(?:홈|경기장|날짜|시간|장소|노선|옵션).*?(?:아니|잘못|다르)/i,
  /(?:나중에|다시).*?(?:꼼꼼히\s*)?확인해보니.*?(?:티켓|예약|요금|수화물|수하물|조건|옵션).*?(?:포함\s*안\s*됨|불가|제외|안\s*됨)/i,
]);

const INCIDENTAL_COMPLAINT_TOPIC = /(?:환불|취소|오류|지연|누락|불편|귀찮|답답|짜증|최악|비추|피해|바가지|먹튀|실패|결항|최소주문|분실|도용|정지|사기|불친절|텃세|싸가지|안됨|안\s*됨|헛걸음|이용\s*불가|연락\s*두절|미발송)/i;

const DISPUTE_ESCALATION_TITLE = /(?:환불).*?(?:강제집행|압류|민원\s*(?:신고|접수)|지급명령|내용증명|과태료)|(?:강제집행|압류|민원\s*(?:신고|접수)|지급명령|내용증명).*?(?:환불)/i;
const DISPUTE_ESCALATION_SNIPPET = /(?:내가|제가|나는|저는|현장\s*방문|법원에서\s*나왔다|집행관|민원\s*(?:신고|접수)|내용\s*적어서\s*보냈|직원\s*아무도\s*없|관리자\s*없|반복적인\s*적발|과태료\s*부과)/i;
const DEFECT_REFUND_TITLE = /(?:구매\s*(?:및|&)?\s*환불후기|환불후기)/i;
const DEFECT_REFUND_SNIPPET = /(?:제품\s*)?(?:하자|불량|파손|오배송)(?:\?\)?|\)?|로|가|때문|으로|\s).*?(?:환불|반품|교환)|(?:환불|반품|교환).*?(?:제품\s*)?(?:하자|불량|파손|오배송)/i;

export function classifySourceCausality(signal) {
  const title = extractSourceTitle(signal);
  const snippet = extractSourceSnippet(signal);
  const combined = `${title}\n${snippet}`;
  const selfCaused = SELF_CAUSED_MISTAKE_PATTERNS.some((pattern) => pattern.test(combined));

  return {
    version: SOURCE_CAUSALITY_VERSION,
    causality: selfCaused ? "self_caused_mistake" : "external_or_unresolved",
  };
}

export function classifySourceRecovery(signal) {
  const title = extractSourceTitle(signal);
  const snippet = extractSourceSnippet(signal);
  const ownership = classifyPainOwnership(signal);

  if (ownership.ownership === "borrowed_leadgen") {
    return { version: SOURCE_RECOVERY_VERSION, recovery: null };
  }

  if (DISPUTE_ESCALATION_TITLE.test(title) && DISPUTE_ESCALATION_SNIPPET.test(snippet)) {
    return { version: SOURCE_RECOVERY_VERSION, recovery: "first_hand_dispute_escalation" };
  }

  if (DEFECT_REFUND_TITLE.test(title) && DEFECT_REFUND_SNIPPET.test(snippet)) {
    return { version: SOURCE_RECOVERY_VERSION, recovery: "defect_driven_refund" };
  }

  return { version: SOURCE_RECOVERY_VERSION, recovery: null };
}

export function classifySourceIntent(signal) {
  const base = classifyBaseSourceIntent(signal);
  const causality = classifySourceCausality(signal);
  if (causality.causality !== "self_caused_mistake") return base;
  return {
    ...base,
    pain_role: "self_caused",
  };
}

export function classifySourceAdmission(signal) {
  const base = classifyBaseSourceAdmission(signal);

  if (signal?.source_platform === "naver_blog") {
    const causality = classifySourceCausality(signal);
    if (causality.causality === "self_caused_mistake") {
      return policyAdmission(base, {
        decision: "reject",
        reasonCodes: ["snippet_self_caused_mistake"],
        requiresFullContext: false,
      });
    }

    if (isIncidentalParentheticalComplaint(extractSourceSnippet(signal))) {
      return policyAdmission(base, {
        decision: "reject",
        reasonCodes: ["snippet_incidental_complaint_only"],
        requiresFullContext: false,
      });
    }

    const recovery = classifySourceRecovery(signal);
    if (recovery.recovery === "first_hand_dispute_escalation") {
      return policyAdmission(base, {
        decision: "candidate",
        reasonCodes: ["title_first_hand_dispute_escalation"],
        requiresFullContext: false,
      });
    }
    if (recovery.recovery === "defect_driven_refund") {
      return policyAdmission(base, {
        decision: "candidate",
        reasonCodes: ["title_first_hand_defect_refund"],
        requiresFullContext: false,
      });
    }
  }

  return {
    ...base,
    policy_revision: SOURCE_ADMISSION_POLICY_REVISION,
  };
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

function isIncidentalParentheticalComplaint(snippet) {
  if (!snippet) return false;
  const parentheticals = [...snippet.matchAll(/\([^)]{1,180}\)/g)].map((match) => match[0]);
  if (!parentheticals.some((part) => INCIDENTAL_COMPLAINT_TOPIC.test(part))) return false;
  const outside = snippet.replace(/\([^)]{1,180}\)/g, " ");
  return !INCIDENTAL_COMPLAINT_TOPIC.test(outside);
}

function policyAdmission(base, { decision, reasonCodes, requiresFullContext }) {
  return {
    ...base,
    policy_revision: SOURCE_ADMISSION_POLICY_REVISION,
    decision,
    reason_codes: reasonCodes,
    requires_full_context: requiresFullContext,
  };
}
