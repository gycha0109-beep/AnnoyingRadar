import { createHash } from "node:crypto";

import { PHASE15_9C_CAMPAIGN_VERSION } from "./phase15-9c-expanded-telecom-plan.mjs";

export const PHASE15_9D_VERSION = "phase15.9d-telecom-rejection-diagnostics-v0.1";
export const PHASE15_9D_SOURCE_CAMPAIGN_VERSION = PHASE15_9C_CAMPAIGN_VERSION;
export const PHASE15_9D_EXPECTED_REJECT_COHORT = 313;
export const PHASE15_9D_PER_STRATUM = 4;
export const PHASE15_9D_SAMPLE_SIZE = 16;

export const PHASE15_9D_REJECTION_STRATA = Object.freeze([
  "title_no_complaint_signal",
  "snippet_information_only",
  "title_truncated_no_complaint_signal",
  "title_information_or_guide",
]);

export function phase15_9DStableHash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function selectPhase15_9DRejectSample(records, { excludedSignalIds = new Set() } = {}) {
  const eligible = (records ?? []).filter((record) => {
    const reason = record.admission?.reason_codes?.[0] ?? null;
    return record.admission?.decision === "reject"
      && PHASE15_9D_REJECTION_STRATA.includes(reason)
      && !excludedSignalIds.has(record.signal.id);
  });

  const selected = [];
  for (const reason of PHASE15_9D_REJECTION_STRATA) {
    const bucket = eligible
      .filter((record) => record.admission.reason_codes[0] === reason)
      .sort((left, right) => {
        const leftIdentity = left.signal.external_content_id ?? left.signal.id;
        const rightIdentity = right.signal.external_content_id ?? right.signal.id;
        const leftHash = phase15_9DStableHash(`${PHASE15_9D_VERSION}:${reason}:${leftIdentity}`);
        const rightHash = phase15_9DStableHash(`${PHASE15_9D_VERSION}:${reason}:${rightIdentity}`);
        if (leftHash !== rightHash) return leftHash.localeCompare(rightHash);
        return String(leftIdentity).localeCompare(String(rightIdentity));
      });
    if (bucket.length < PHASE15_9D_PER_STRATUM) {
      throw new Error(`Phase 15.9D stratum ${reason} has ${bucket.length}; requires ${PHASE15_9D_PER_STRATUM}`);
    }
    selected.push(...bucket.slice(0, PHASE15_9D_PER_STRATUM));
  }

  if (selected.length !== PHASE15_9D_SAMPLE_SIZE) {
    throw new Error(`Phase 15.9D selected ${selected.length}; expected ${PHASE15_9D_SAMPLE_SIZE}`);
  }
  if (new Set(selected.map((record) => record.signal.id)).size !== selected.length) {
    throw new Error("Phase 15.9D sample must contain distinct Source Signals");
  }
  return selected;
}

export function summarizePhase15_9DDiagnostics(results) {
  const summary = {
    total: results.length,
    fetched_resolved: 0,
    fetched_unavailable: 0,
    candidate: 0,
    review: 0,
    reject: 0,
    false_negative_confirmed: 0,
    false_negative_possible: 0,
    policy_consistent: 0,
  };

  for (const item of results) {
    if (item.fetch_status === "resolved") summary.fetched_resolved += 1;
    else summary.fetched_unavailable += 1;
    if (item.full_context_decision === "candidate") {
      summary.candidate += 1;
      summary.false_negative_confirmed += 1;
    } else if (item.full_context_decision === "review") {
      summary.review += 1;
      summary.false_negative_possible += 1;
    } else if (item.full_context_decision === "reject") {
      summary.reject += 1;
      summary.policy_consistent += 1;
    }
  }
  return summary;
}
