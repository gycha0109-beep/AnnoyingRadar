import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const PHASE15_8O_PACKET_VERSION = "phase15.8o-incident-mechanism-curator-packet-v0.1";
export const PHASE15_8O_SOURCE_BATCH_VERSION = "phase15.8m-b-remainder-v0.1";
export const PHASE15_8O_CANDIDATE_FINGERPRINT = "aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020";

const SOURCE_PLAN = Object.freeze({
  "20a1d6b12b080de327f321cc7a65263a414bb079a165eb2630625eb1747dbd28": Object.freeze({
    disposition: "strong_candidate",
    comparison_proposal_key: "lodging_reservation_fulfillment",
  }),
  "88766f79a40e153875a6abc48d7fe0c11711a0390f1b3260e911b72510451cbf": Object.freeze({
    disposition: "blocked_review",
    comparison_proposal_key: null,
  }),
  "9c22ad17af4ae44a143e4a651688c9c077d8d466752d7f7c9a2e6eb00906c77e": Object.freeze({
    disposition: "curator_reread_required",
    comparison_proposal_key: null,
  }),
  "f029adff5b40217d0306876f9f96cb4e14bc727d51b83d06ad4b43d4624dc684": Object.freeze({
    disposition: "curator_reread_required",
    comparison_proposal_key: null,
  }),
  "b37948f305d9432ff0a8c103715b62b867ca72bc63ede1c83ad54b0d5a003e2d": Object.freeze({
    disposition: "blocked_review",
    comparison_proposal_key: null,
  }),
  "10dcb81e724cc1844b37b698ff72533d17305c2f1a8f79240a14782333f8a4ae": Object.freeze({
    disposition: "strong_candidate",
    comparison_proposal_key: "lodging_reservation_fulfillment",
  }),
  "71130407a9e9a330bd4cee03d51acb88f2f3e6bbdb53825588126b4995594c3c": Object.freeze({
    disposition: "strong_candidate",
    comparison_proposal_key: "mobile_portout_restriction",
  }),
  "992d597f952c0e4dbe5397bd3f943518447562329b98358847369e521ba671c2": Object.freeze({
    disposition: "reject",
    comparison_proposal_key: null,
  }),
});

export const PHASE15_8O_PROPOSED_COMPARISONS = Object.freeze([
  Object.freeze({
    proposal_key: "lodging_reservation_fulfillment",
    expected_source_count: 2,
    proposal: "Compare as potentially independent incidents of lodging-intermediary reservation confirmation or fulfillment failure.",
  }),
  Object.freeze({
    proposal_key: "mobile_portout_restriction",
    expected_source_count: 1,
    proposal: "Review as a strong singleton incident candidate involving forced port-out restriction and discount clawback.",
  }),
]);

export function hashSourceSignalId(sourceSignalId) {
  return createHash("sha256").update(String(sourceSignalId ?? "")).digest("hex");
}

export function fingerprintSourceSignalIds(sourceSignalIds) {
  return createHash("sha256")
    .update([...sourceSignalIds].map(String).sort().join("\n"))
    .digest("hex");
}

export function resolvePhase15_8OSourcePlan(sourceSignalId) {
  return SOURCE_PLAN[hashSourceSignalId(sourceSignalId)] ?? null;
}

export function validatePhase15_8OCandidateAuthority(candidateRows) {
  assert.ok(Array.isArray(candidateRows), "candidateRows must be an array");
  assert.equal(candidateRows.length, 8, "Phase 15.8O requires the exact eight M-B Candidates");
  const ids = candidateRows.map((row) => String(row?.source_signal_id ?? row?.id ?? ""));
  assert.ok(ids.every(Boolean), "every Phase 15.8O Candidate must have a Source Signal id");
  assert.equal(new Set(ids).size, 8, "Phase 15.8O Candidate ids must be unique");
  assert.equal(
    fingerprintSourceSignalIds(ids),
    PHASE15_8O_CANDIDATE_FINGERPRINT,
    "Phase 15.8O Candidate fingerprint drifted",
  );

  const planned = candidateRows.map((row) => {
    const sourceSignalId = String(row?.source_signal_id ?? row?.id ?? "");
    const plan = resolvePhase15_8OSourcePlan(sourceSignalId);
    assert.ok(plan, "Phase 15.8O closeout disposition is missing for one Candidate");
    return { sourceSignalId, ...plan };
  });

  const dispositionCounts = {};
  for (const item of planned) {
    dispositionCounts[item.disposition] = (dispositionCounts[item.disposition] ?? 0) + 1;
  }
  assert.deepEqual(dispositionCounts, {
    strong_candidate: 3,
    blocked_review: 2,
    curator_reread_required: 2,
    reject: 1,
  });

  for (const comparison of PHASE15_8O_PROPOSED_COMPARISONS) {
    const count = planned.filter((item) => item.comparison_proposal_key === comparison.proposal_key).length;
    assert.equal(count, comparison.expected_source_count, `Phase 15.8O comparison ${comparison.proposal_key} drifted`);
  }

  return planned;
}

export function buildBlankCuratorDecisionTemplate(plannedSources) {
  const actionable = plannedSources.filter((item) => ["strong_candidate", "curator_reread_required"].includes(item.disposition));
  return {
    packet_version: PHASE15_8O_PACKET_VERSION,
    authority: "blank_curator_decision_template_not_a_decision",
    source_decisions: actionable.map((item) => ({
      source_signal_id: item.sourceSignalId,
      evidence_decision: null,
      incident_action: null,
      existing_incident_id: null,
      new_incident_key: null,
      new_incident_label: null,
      notes: null,
    })),
    comparison_decisions: PHASE15_8O_PROPOSED_COMPARISONS
      .filter((item) => item.expected_source_count > 1)
      .map((item) => ({
        proposal_key: item.proposal_key,
        same_problem_mechanism: null,
        problem_signature: null,
        notes: null,
      })),
    persistence_authorized: false,
  };
}

export function assertBlankCuratorDecisionTemplate(template) {
  assert.equal(template?.persistence_authorized, false, "curator packet must not authorize persistence");
  for (const decision of template?.source_decisions ?? []) {
    for (const key of ["evidence_decision", "incident_action", "existing_incident_id", "new_incident_key", "new_incident_label", "notes"]) {
      assert.equal(decision[key], null, `curator source decision ${key} must remain blank`);
    }
  }
  for (const decision of template?.comparison_decisions ?? []) {
    for (const key of ["same_problem_mechanism", "problem_signature", "notes"]) {
      assert.equal(decision[key], null, `curator comparison decision ${key} must remain blank`);
    }
  }
  return template;
}
