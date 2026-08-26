import assert from "node:assert/strict";

import {
  PHASE15_8O_CANDIDATE_FINGERPRINT,
  hashSourceSignalId,
} from "./source-incident-curator-packet.mjs";

export const PHASE15_8P_APPROVAL_VERSION = "phase15.8p-approved-incident-persistence-v0.1";
export const PHASE15_8P_SOURCE_BATCH_VERSION = "phase15.8m-b-remainder-v0.1";
export const PHASE15_8P_CANDIDATE_FINGERPRINT = PHASE15_8O_CANDIDATE_FINGERPRINT;
export const PHASE15_8P_PROBLEM_SIGNATURE = "lodging_reservation_fulfillment_gap";

const APPROVED_SOURCE_PLAN = Object.freeze({
  "20a1d6b12b080de327f321cc7a65263a414bb079a165eb2630625eb1747dbd28": Object.freeze({
    evidence_decision: "accept",
    incident_action: "create_new",
    incident_key: "yeogieottae_reservation_fulfillment_gap_case",
    incident_label: "여기어때 해외숙소 예약 누락·대체숙소 보상 사건",
  }),
  "10dcb81e724cc1844b37b698ff72533d17305c2f1a8f79240a14782333f8a4ae": Object.freeze({
    evidence_decision: "accept",
    incident_action: "create_new",
    incident_key: "agoda_reservation_fulfillment_gap_case",
    incident_label: "아고다 숙소 예약 미반영·환불 보상 사건",
  }),
});

export function resolvePhase15_8PApprovedSource(sourceSignalId) {
  return APPROVED_SOURCE_PLAN[hashSourceSignalId(sourceSignalId)] ?? null;
}

export function buildPhase15_8PApprovedPersistencePlan(candidateRows) {
  assert.ok(Array.isArray(candidateRows), "candidateRows must be an array");
  assert.equal(candidateRows.length, 8, "Phase 15.8P requires the exact M-B Candidate 8 cohort");

  const approved = [];
  for (const row of candidateRows) {
    const sourceSignalId = String(row?.source_signal_id ?? row?.id ?? "");
    assert.ok(sourceSignalId, "every Candidate requires source_signal_id");
    const decision = resolvePhase15_8PApprovedSource(sourceSignalId);
    if (!decision) continue;
    approved.push({
      source_signal_id: sourceSignalId,
      ...decision,
      problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
    });
  }

  approved.sort((left, right) => left.incident_key.localeCompare(right.incident_key));
  assert.equal(approved.length, 2, "Phase 15.8P approval must resolve exactly two lodging Sources");
  assert.equal(new Set(approved.map((item) => item.source_signal_id)).size, 2, "approved Source ids must be unique");
  assert.equal(new Set(approved.map((item) => item.incident_key)).size, 2, "approved Incident keys must be unique");
  assert.ok(approved.every((item) => item.evidence_decision === "accept"), "all P persistence Sources must be accepted evidence");
  assert.ok(approved.every((item) => item.incident_action === "create_new"), "all P persistence Sources must create new Incidents");
  assert.ok(approved.every((item) => item.problem_signature === PHASE15_8P_PROBLEM_SIGNATURE));

  return {
    approval_version: PHASE15_8P_APPROVAL_VERSION,
    source_batch_version: PHASE15_8P_SOURCE_BATCH_VERSION,
    candidate_fingerprint: PHASE15_8P_CANDIDATE_FINGERPRINT,
    problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
    same_problem_mechanism: true,
    approved_sources: approved,
    mobile_singleton_persistence_authorized: false,
    canonical_problem_persistence_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };
}
