import assert from "node:assert/strict";

import { PHASE15_8Q_INCIDENT_KEYS } from "./approved-canonical-problem-draft.mjs";
import { PHASE15_8T_EVIDENCE_AUTHORITIES, PHASE15_8T_PROBLEM_SIGNATURE } from "./public-evidence-persistence-pair.mjs";
import { sha256 } from "./historical-evidence-span-readiness.mjs";

export const PHASE15_8U_VERSION = "phase15.8u-publication-curator-decision-packet-v0.1";
export const PHASE15_8U_PROBLEM_SIGNATURE = PHASE15_8T_PROBLEM_SIGNATURE;
export const PHASE15_8U_EXPECTED_INCIDENT_KEYS = Object.freeze([...PHASE15_8Q_INCIDENT_KEYS].sort());

export function buildBlankPublicationDecisionTemplate() {
  return {
    publication_decision: null,
    decision_reason: null,
    metadata_edits_authorized: false,
    evidence_edits_authorized: false,
    publication_authorized: false,
  };
}

export function assertBlankPublicationDecisionTemplate(template) {
  assert.equal(template?.publication_decision, null, "publication decision must remain blank");
  assert.equal(template?.decision_reason, null, "publication decision reason must remain blank");
  assert.equal(template?.metadata_edits_authorized, false, "metadata edits must remain unauthorized");
  assert.equal(template?.evidence_edits_authorized, false, "Evidence edits must remain unauthorized");
  assert.equal(template?.publication_authorized, false, "publication must remain unauthorized");
  return template;
}

export function validatePublicationEvidenceRows(rows, incidentById) {
  assert.equal(rows.length, 2, "15.8U requires exactly two persisted Evidence rows");
  const ordered = [...rows].sort((a, b) => a.order_index - b.order_index);
  assert.deepEqual(ordered.map((row) => row.order_index), [0, 1], "Evidence order must remain 0 then 1");
  assert.equal(new Set(ordered.map((row) => row.source_key)).size, 2, "publication requires two distinct source_key values");
  assert.equal(new Set(ordered.map((row) => row.incident_id)).size, 2, "publication requires two distinct Incidents");
  assert.equal(new Set(ordered.map((row) => row.source_signal_id)).size, 2, "publication requires two distinct Sources");

  for (const [index, row] of ordered.entries()) {
    const authority = PHASE15_8T_EVIDENCE_AUTHORITIES[index];
    assert.equal(row.publication_basis, "external_public", "15.8U Evidence must remain external_public");
    assert.equal(row.source_type, "naver_blog", "15.8U Evidence source_type drifted");
    assert.equal(sha256(row.source_key), authority.source_key_sha256, "Evidence source_key authority drifted");
    assert.equal(row.excerpt.length, authority.excerpt_length, "Evidence excerpt length authority drifted");
    assert.equal(sha256(row.excerpt), authority.excerpt_sha256, "Evidence excerpt hash authority drifted");
    const incident = incidentById.get(row.incident_id);
    assert.ok(incident, "Evidence Incident lookup failed");
    assert.equal(incident.incident_key, authority.incident_key, "Evidence Incident authority drifted");
  }

  assert.deepEqual(
    ordered.map((row) => incidentById.get(row.incident_id)?.incident_key).sort(),
    PHASE15_8U_EXPECTED_INCIDENT_KEYS,
    "approved Incident set drifted",
  );
  return ordered;
}

export function buildPublicationCuratorPacket({ problem, evidenceRows, incidentById, publishabilityGuardPassed, databaseBefore, databaseAfter }) {
  const ordered = validatePublicationEvidenceRows(evidenceRows, incidentById);
  assert.equal(problem.problem_signature, PHASE15_8U_PROBLEM_SIGNATURE);
  assert.equal(problem.status, "draft", "publication packet requires an active draft");
  assert.equal(problem.published_at, null, "publication packet draft must remain unpublished");
  assert.equal(problem.archived_at, null, "publication packet draft must remain active");
  assert.equal(publishabilityGuardPassed, true, "publication guard must pass before curator packet emission");
  assert.deepEqual(databaseAfter, databaseBefore, "15.8U must not mutate protected database domains");

  const decision = assertBlankPublicationDecisionTemplate(buildBlankPublicationDecisionTemplate());
  return {
    authority: "publication_curator_decision_packet_not_a_decision",
    version: PHASE15_8U_VERSION,
    problem: {
      problem_signature: problem.problem_signature,
      title: problem.title,
      summary: problem.summary,
      target_user: problem.target_user,
      situation: problem.situation,
      category: problem.category,
      status: problem.status,
    },
    evidence: ordered.map((row) => ({
      order_index: row.order_index,
      incident_key: incidentById.get(row.incident_id).incident_key,
      excerpt: row.excerpt,
      excerpt_length: row.excerpt.length,
      excerpt_sha256: sha256(row.excerpt),
      publication_basis: row.publication_basis,
      source_type: row.source_type,
      source_label: row.source_label,
      source_url: row.source_url,
      source_key_sha256: sha256(row.source_key),
      exact_source_incident_lineage: true,
    })),
    structural_readiness: {
      evidence_count: 2,
      distinct_source_count: 2,
      distinct_incident_count: 2,
      publishability_guard_passed: true,
      public_feed_exposure_before_decision: 0,
    },
    decision,
    database_before: databaseBefore,
    database_after: databaseAfter,
  };
}
