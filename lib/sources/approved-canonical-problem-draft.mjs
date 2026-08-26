import assert from "node:assert/strict";

import { evaluateCanonicalProblemDraft } from "./canonical-problem-draft.mjs";
import { PHASE15_8P_PROBLEM_SIGNATURE } from "./source-approved-incident-persistence.mjs";
import { buildIncidentAwareProblemClusters } from "./source-problem-formation.mjs";

export const PHASE15_8Q_VERSION = "phase15.8q-canonical-draft-gate-v0.1";
export const PHASE15_8Q_READY_REASON_CODE = "draft_supported_by_independent_incidents";

export const PHASE15_8Q_INCIDENT_KEYS = Object.freeze([
  "agoda_reservation_fulfillment_gap_case",
  "yeogieottae_reservation_fulfillment_gap_case",
]);

export const PHASE15_8Q_EXISTING_LODGING_TITLE =
  "숙소 예외 취소·환불은 플랫폼과 숙소 사이의 반복 확인을 사용자에게 요구할 수 있다";

export const PHASE15_8Q_PROPOSAL = Object.freeze({
  title: "숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다",
  summary:
    "서로 다른 두 숙소 예약 사건에서 예약 중개 플랫폼을 통해 예약이 완료된 것으로 인식했지만 실제 숙소 측 예약이 확보·반영되지 않은 문제가 드러났다. 사용자는 대체 숙소, 환불·보상 처리를 별도로 진행해야 했다.",
  target_user: "OTA·숙소 예약 플랫폼을 통해 숙박을 예약하는 여행자",
  situation:
    "플랫폼을 통해 예약이 완료·확정된 것으로 보였지만 실제 숙소 측 예약 반영 또는 이용이 정상적으로 이어지지 않은 상황",
  category: "travel_booking",
});

export function buildPhase15_8QCanonicalDraft({ incidentLinks, publicProblems } = {}) {
  const links = normalizeLinks(incidentLinks);
  const existingProblems = Array.isArray(publicProblems) ? publicProblems : [];

  const rows = links.map((item) => ({
    formation_state: "eligible",
    source_signal_id: item.source_signal_id,
    incident_key: item.incident_key,
    problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
  }));

  const clusters = buildIncidentAwareProblemClusters(rows);
  assert.equal(clusters.length, 1, "Phase 15.8Q requires exactly one approved repeated cluster");
  const cluster = clusters[0];
  assert.equal(cluster.problem_signature, PHASE15_8P_PROBLEM_SIGNATURE);
  assert.equal(cluster.source_count, 2);
  assert.equal(cluster.incident_count, 2);
  assert.equal(cluster.repeat_eligible, true);

  const draftResult = evaluateCanonicalProblemDraft({
    cluster,
    proposal: PHASE15_8Q_PROPOSAL,
  });
  assert.equal(draftResult.draft_state, "ready", "approved repeated cluster must pass Canonical Draft Gate");
  assert.deepEqual(
    draftResult.reason_codes,
    [PHASE15_8Q_READY_REASON_CODE],
    "Canonical Draft Gate ready authority drifted",
  );
  assert.equal(draftResult.draft.persistence_state, "not_persisted");
  assert.equal(draftResult.draft.publication_state, "not_published");

  const existingLodging = existingProblems.filter(
    (problem) => problem?.title === PHASE15_8Q_EXISTING_LODGING_TITLE,
  );
  assert.equal(existingLodging.length, 1, "existing published lodging exception Problem authority drifted");
  assert.equal(existingLodging[0].status, "published", "existing lodging exception Problem must remain published");
  assert.notEqual(existingLodging[0].title, draftResult.draft.title);
  assert.notEqual(existingLodging[0].summary, draftResult.draft.summary);

  return {
    version: PHASE15_8Q_VERSION,
    authority: "canonical_problem_draft_gate_read_only",
    draft_result: draftResult,
    relationship_to_existing_lodging_problem: {
      relation: "distinct_adjacent_problem",
      existing_problem_title: PHASE15_8Q_EXISTING_LODGING_TITLE,
      existing_mechanism: "exception_cancellation_refund_coordination",
      new_problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
      distinction: {
        existing_trigger: "a valid lodging booking later requires exception cancellation or refund approval",
        new_trigger: "a platform-confirmed lodging booking is absent, unsecured, or not fulfilled by the lodging side",
      },
      remediation_overlap_possible: true,
      merge_authorized: false,
      existing_problem_mutation_authorized: false,
    },
    persistence_authorized: false,
    public_evidence_persistence_authorized: false,
    publication_authorized: false,
  };
}

function normalizeLinks(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError("Phase 15.8Q requires exactly two persisted Incident→Source links");
  }

  const links = value.map((item) => {
    if (!item || typeof item !== "object") throw new TypeError("incident link must be an object");
    const incidentKey = required(item.incident_key, "incident_key");
    const sourceId = required(item.source_signal_id, "source_signal_id");
    return { incident_key: incidentKey, source_signal_id: sourceId };
  });

  const incidentKeys = [...new Set(links.map((item) => item.incident_key))].sort();
  assert.deepEqual(incidentKeys, [...PHASE15_8Q_INCIDENT_KEYS].sort(), "approved Incident identity drifted");
  assert.equal(new Set(links.map((item) => item.source_signal_id)).size, 2, "approved Incidents require two distinct Sources");

  return links.sort((a, b) => a.incident_key.localeCompare(b.incident_key));
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}
