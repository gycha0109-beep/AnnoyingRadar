import assert from "node:assert/strict";

import { PHASE15_8Q_PROPOSAL } from "./approved-canonical-problem-draft.mjs";
import {
  PHASE15_8U_PROBLEM_SIGNATURE,
  validatePublicationEvidenceRows,
} from "./publication-curator-packet.mjs";

export const PHASE15_8V_VERSION = "phase15.8v-publication-execution-v0.1";
export const PHASE15_8V_PROBLEM_SIGNATURE = PHASE15_8U_PROBLEM_SIGNATURE;
export const PHASE15_8V_APPROVAL = Object.freeze({
  publication_decision: "approve",
  decision_reason: "explicit_curator_publication_approval_without_edits",
  metadata_edits_authorized: false,
  evidence_edits_authorized: false,
  publication_authorized: true,
});

function assertExactProblemCopy(problem) {
  assert.equal(problem.problem_signature, PHASE15_8V_PROBLEM_SIGNATURE, "publication target signature drifted");
  assert.equal(problem.title, PHASE15_8Q_PROPOSAL.title, "publication target title drifted");
  assert.equal(problem.summary, PHASE15_8Q_PROPOSAL.summary, "publication target summary drifted");
  assert.equal(problem.target_user, PHASE15_8Q_PROPOSAL.target_user, "publication target user drifted");
  assert.equal(problem.situation, PHASE15_8Q_PROPOSAL.situation, "publication target situation drifted");
  assert.equal(problem.category, PHASE15_8Q_PROPOSAL.category, "publication target category drifted");
}

export function assertApprovedPublicationPreconditions({ problem, evidenceRows, incidentById, targetFeedRows }) {
  assert.deepEqual(PHASE15_8V_APPROVAL, {
    publication_decision: "approve",
    decision_reason: "explicit_curator_publication_approval_without_edits",
    metadata_edits_authorized: false,
    evidence_edits_authorized: false,
    publication_authorized: true,
  });
  assertExactProblemCopy(problem);
  assert.equal(problem.status, "draft", "publication execution requires the approved draft state");
  assert.equal(problem.published_at, null, "approved draft must not already be published");
  assert.equal(problem.archived_at, null, "approved draft must remain active");
  assert.equal(targetFeedRows, 0, "approved draft must not already be exposed in public feed");
  validatePublicationEvidenceRows(evidenceRows, incidentById);
  return true;
}

export function assertPublishedReadback({ problem, evidenceRows, incidentById, targetFeedRows }) {
  assertExactProblemCopy(problem);
  assert.equal(problem.status, "published", "publication execution must end in published state");
  assert.ok(problem.published_at, "published Problem must have published_at");
  assert.equal(problem.archived_at, null, "published Problem must remain active");
  assert.equal(targetFeedRows, 1, "published Problem must appear exactly once in public feed");
  validatePublicationEvidenceRows(evidenceRows, incidentById);
  return true;
}
