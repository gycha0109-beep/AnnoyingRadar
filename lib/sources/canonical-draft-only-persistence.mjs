import assert from "node:assert/strict";

export const CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION = "canonical-draft-only-persistence-v0.1";

export function buildCanonicalDraftOnlyPersistencePlan({ draftResult } = {}) {
  if (draftResult?.draft_state !== "ready" || !draftResult?.draft) {
    throw new TypeError("a ready Canonical Problem draft is required");
  }

  const draft = draftResult.draft;
  const problemSignature = required(draft.problem_signature, "problem_signature");
  const title = required(draft.title, "title");
  const summary = required(draft.summary, "summary");

  assert.equal(draft.persistence_state, "not_persisted", "draft must not already claim persistence");
  assert.equal(draft.publication_state, "not_published", "draft must not already claim publication");
  assert.ok(Number.isInteger(draft.source_count) && draft.source_count >= 2, "draft requires at least two Sources");
  assert.ok(Number.isInteger(draft.incident_count) && draft.incident_count >= 2, "draft requires at least two Incidents");
  assert.equal(
    new Set(draft.source_signal_ids ?? []).size,
    draft.source_count,
    "draft Source identity must be complete before persistence",
  );
  assert.equal(
    new Set(draft.incident_keys ?? []).size,
    draft.incident_count,
    "draft Incident identity must be complete before persistence",
  );

  return {
    version: CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION,
    persistence_state: "ready_for_draft_only_persistence",
    rpc: "ar_create_canonical_public_problem_draft",
    args: {
      p_problem_signature: problemSignature,
      p_title: title,
      p_summary: summary,
      p_target_user: nullable(draft.target_user),
      p_situation: nullable(draft.situation),
      p_category: nullable(draft.category),
    },
    invariants: {
      source_count: draft.source_count,
      incident_count: draft.incident_count,
      public_problem_status: "draft",
      public_evidence_write_count: 0,
      existing_problem_mutation_count: 0,
      publication_count: 0,
    },
  };
}

export function assertPersistedCanonicalDraftMatchesPlan({ row, plan } = {}) {
  if (!row || typeof row !== "object") throw new TypeError("persisted Public Problem row is required");
  if (!plan || typeof plan !== "object") throw new TypeError("draft persistence plan is required");

  const expected = plan.args;
  assert.equal(row.problem_signature, expected.p_problem_signature);
  assert.equal(row.title, expected.p_title);
  assert.equal(row.summary, expected.p_summary);
  assert.equal(row.target_user, expected.p_target_user);
  assert.equal(row.situation, expected.p_situation);
  assert.equal(row.category, expected.p_category);
  assert.equal(row.status, "draft");
  assert.equal(row.published_at, null);
  assert.equal(row.archived_at, null);
  return true;
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function nullable(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
