import { createHash } from "node:crypto";

import {
  classifySourceAdmission,
  extractSourceSnippet,
  extractSourceTitle,
  SOURCE_ADMISSION_POLICY_REVISION,
  SOURCE_ADMISSION_VERSION,
} from "./source-admission-policy.mjs";

export const SOURCE_ADMISSION_AUDIT_VERSION = "source-admission-independent-audit-v0.1";
export const SOURCE_ADMISSION_AUDIT_STATE_VERSION = "source-admission-audit-state-v0.1";
export const SOURCE_ADMISSION_AUDIT_RANDOM_SIZE = 100;
export const SOURCE_ADMISSION_AUDIT_RANDOM_SEED = "phase15-5e-independent-reject-control-v1";

// Audit-only, high-recall probes. These are deliberately separate from the
// production admission regexes. A match never changes Source Admission; it only
// selects a REJECT for human false-negative inspection.
const INDEPENDENT_RISK_RULES = Object.freeze([
  {
    code: "dependency_blocks_access",
    pattern: /(?:때문에|탓에).{0,48}(?:못\s*(?:타|쓰|이용|받|가|들어|신청|예약|결제|접근|참여|하)|이용\s*(?:불가|못|어려)|접근\s*(?:불가|못|어려)|사용\s*(?:불가|못|어려))/i,
  },
  {
    code: "explicit_access_denial",
    pattern: /(?:이용|사용|접근|신청|예약|탑승|진료|치료|구매|결제).{0,28}(?:불가|못\s*(?:함|해|하|한다|했다|하는)|안\s*됨|어려움|막힘|차단)/i,
  },
  {
    code: "long_wait_or_indefinite_wait",
    pattern: /(?:(?:\d+\s*(?:개월|달|주|일|시간)).{0,28}(?:대기|기다)|(?:대기|기다).{0,28}(?:\d+\s*(?:개월|달|주|일|시간))|하염없이\s*대기|기약\s*없이\s*(?:대기|기다))/i,
  },
  {
    code: "forced_replacement_or_abandonment",
    pattern: /(?:어쩔\s*수\s*없이|결국|강제로|울며\s*겨자).{0,42}(?:교체|재구매|새로\s*(?:구입|구매)|포기|해지|탈퇴)/i,
  },
  {
    code: "cost_shock_or_loss",
    pattern: /(?:\d[\d,]*(?:\.\d+)?\s*(?:만원|원)|수리\s*(?:비|금액|견적)|위약금|추가\s*비용|수수료).{0,52}(?:부담|비싸|과다|폭탄|손해|포기|교체|재구매|결국)/i,
  },
  {
    code: "loss_mentions_cost",
    pattern: /(?:부담|비싸|과다|폭탄|손해|포기).{0,52}(?:\d[\d,]*(?:\.\d+)?\s*(?:만원|원)|수리\s*(?:비|금액|견적)|위약금|추가\s*비용|수수료)/i,
  },
  {
    code: "repeated_failure_or_retry",
    pattern: /(?:계속|반복|매번|수차례|몇\s*번|여러\s*번).{0,42}(?:실패|오류|안\s*됨|못\s*함|대기|문의|전화|재시도|취소|지연|누락|헛걸음)/i,
  },
  {
    code: "forced_or_unilateral_change",
    pattern: /(?:강제|강제로|일방적|일방적으로|동의\s*없이).{0,42}(?:취소|변경|교체|결제|해지|삭제|정지|차단|퇴실|거절)/i,
  },
  {
    code: "contact_or_response_breakdown",
    pattern: /(?:연락|문의|전화|답변|응답).{0,28}(?:두절|안\s*(?:돼|됨|온|옴)|없(?:음|다)|무응답|씹)/i,
  },
  {
    code: "money_or_refund_not_received",
    pattern: /(?:돈|환불|보상|정산|급여|수당).{0,28}(?:못\s*받|안\s*됨|거절|거부|미지급|미송금|누락)/i,
  },
  {
    code: "repeat_visit_or_wasted_trip",
    pattern: /(?:헛걸음|재방문|다시\s*방문|다시\s*찾아|여러\s*곳을\s*찾아|발품).{0,36}(?:반복|해야|했|하게|문제|불편|때문)?/i,
  },
]);

const LEGACY_REPLAY_UNSAFE_REASONS = new Set([
  "title_borrowed_pain_leadgen",
  "snippet_self_caused_mistake",
  "snippet_incidental_complaint_only",
]);

export function findIndependentAuditRisk(signal) {
  const title = extractSourceTitle(signal);
  const snippet = extractSourceSnippet(signal);
  const titleCodes = matchRiskCodes(title);
  const snippetCodes = matchRiskCodes(snippet);
  const reasonCodes = [...new Set([...titleCodes, ...snippetCodes])];
  const scopes = [];
  if (titleCodes.length) scopes.push("title");
  if (snippetCodes.length) scopes.push("snippet");

  return {
    flagged: reasonCodes.length > 0,
    reason_codes: reasonCodes,
    matched_scopes: scopes,
  };
}

export function buildSourceAdmissionIndependentAudit(signals, {
  randomSize = SOURCE_ADMISSION_AUDIT_RANDOM_SIZE,
} = {}) {
  const rows = (signals ?? []).map((signal) => ({
    signal,
    admission: classifySourceAdmission(signal),
  }));
  const candidates = rows.filter((row) => row.admission.decision === "candidate");
  const boundaryRows = rows.filter((row) => row.admission.decision === "review");
  const rejectRows = rows.filter((row) => row.admission.decision === "reject");

  const rejectRiskRows = rejectRows
    .map((row) => ({ ...row, auditRisk: findIndependentAuditRisk(row.signal) }))
    .filter((row) => row.auditRisk.flagged);
  const riskIds = new Set(rejectRiskRows.map((row) => row.signal.id));

  const rejectRandomRows = rejectRows
    .filter((row) => !riskIds.has(row.signal.id))
    .sort((left, right) => auditHash(left.signal.id).localeCompare(auditHash(right.signal.id)))
    .slice(0, Math.max(0, randomSize));

  const poolFingerprint = createHash("sha256")
    .update(rows.map((row) => row.signal.id).filter(Boolean).sort().join("\n"))
    .digest("hex")
    .slice(0, 16);

  return {
    manifest: {
      audit_version: SOURCE_ADMISSION_AUDIT_VERSION,
      audit_state_version: SOURCE_ADMISSION_AUDIT_STATE_VERSION,
      admission_version: SOURCE_ADMISSION_VERSION,
      admission_policy_revision: SOURCE_ADMISSION_POLICY_REVISION,
      pool_fingerprint: poolFingerprint,
      eligible: rows.length,
      candidate_count: candidates.length,
      boundary_count: boundaryRows.length,
      reject_count: rejectRows.length,
      reject_risk_count: rejectRiskRows.length,
      reject_random_count: rejectRandomRows.length,
      human_item_count: boundaryRows.length + rejectRiskRows.length + rejectRandomRows.length,
      random_seed: SOURCE_ADMISSION_AUDIT_RANDOM_SEED,
      random_target: randomSize,
    },
    boundary_set: boundaryRows.map((row) => toAuditItem(row.signal, {
      set: "boundary",
      admission: row.admission,
    })),
    reject_risk_set: rejectRiskRows.map((row) => toAuditItem(row.signal, {
      set: "reject_risk",
      admission: row.admission,
      auditRisk: row.auditRisk,
    })),
    reject_random_set: rejectRandomRows.map((row) => toAuditItem(row.signal, {
      set: "reject_random",
      admission: row.admission,
    })),
  };
}

function matchRiskCodes(value) {
  if (!value) return [];
  return INDEPENDENT_RISK_RULES
    .filter((rule) => rule.pattern.test(value))
    .map((rule) => rule.code);
}

function auditHash(signalId) {
  return createHash("sha256")
    .update(`${SOURCE_ADMISSION_AUDIT_RANDOM_SEED}:${signalId}`)
    .digest("hex");
}

function admissionStateFingerprint({ set, admission, auditRisk }) {
  const payload = {
    state_version: SOURCE_ADMISSION_AUDIT_STATE_VERSION,
    set,
    decision: admission.decision,
    reason_codes: [...(admission.reason_codes ?? [])].sort(),
    requires_full_context: Boolean(admission.requires_full_context),
    audit_risk_codes: [...(auditRisk?.reason_codes ?? [])].sort(),
    audit_risk_scopes: [...(auditRisk?.matched_scopes ?? [])].sort(),
  };
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}

function toAuditItem(signal, { set, admission, auditRisk = null }) {
  const reasonCodes = admission.reason_codes ?? [];
  return {
    id: signal.id,
    set,
    title: extractSourceTitle(signal),
    snippet: extractSourceSnippet(signal),
    canonical_url: signal.canonical_url ?? null,
    author_handle: signal.author_handle ?? null,
    published_at: signal.published_at ?? null,
    audit_risk_codes: auditRisk?.reason_codes ?? [],
    audit_risk_scopes: auditRisk?.matched_scopes ?? [],
    admission_state_fingerprint: admissionStateFingerprint({ set, admission, auditRisk }),
    legacy_replay_safe: !reasonCodes.some((code) => LEGACY_REPLAY_UNSAFE_REASONS.has(code)),
  };
}
