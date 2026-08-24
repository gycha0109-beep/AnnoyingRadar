export const CANONICAL_PROBLEM_PERSISTENCE_VERSION = "canonical-problem-persistence-v0.1";

/**
 * Converts a ready Phase 15.6C draft plus curator-confirmed evidence identity
 * into a deterministic persistence plan. No DB/network operation occurs here.
 */
export function buildCanonicalProblemPersistencePlan({ draftResult, evidence } = {}) {
  if (draftResult?.draft_state !== "ready" || !draftResult?.draft) {
    throw new TypeError("a ready canonical Problem draft is required");
  }

  const draft = draftResult.draft;
  const expectedSources = unique(draft.source_signal_ids);
  const expectedIncidents = unique(draft.incident_keys);
  if (expectedSources.length !== draft.source_count || expectedSources.length < 2) {
    throw new Error("canonical persistence requires complete source identity");
  }
  if (expectedIncidents.length !== draft.incident_count || expectedIncidents.length < 2) {
    throw new Error("canonical persistence requires at least two complete incident identities");
  }

  const rows = (evidence ?? []).map(normalizeEvidence);
  const actualSources = unique(rows.map((row) => row.source_signal_id));
  if (!sameSet(expectedSources, actualSources)) {
    throw new Error("persistence evidence must cover the draft Source Signals exactly once");
  }
  if (rows.length !== actualSources.length) {
    throw new Error("each Source Signal may contribute only one persistence Evidence row");
  }

  const actualIncidents = unique(rows.map((row) => row.incident_key));
  if (!sameSet(expectedIncidents, actualIncidents)) {
    throw new Error("persistence evidence incident identity does not match the draft");
  }
  if (unique(rows.map((row) => row.source_key)).length < 2) {
    throw new Error("canonical persistence requires at least two distinct source keys");
  }

  const incidents = expectedIncidents.map((incidentKey) => ({
    incident_key: incidentKey,
    source_signal_ids: rows
      .filter((row) => row.incident_key === incidentKey)
      .map((row) => row.source_signal_id)
      .sort(),
  }));

  return {
    version: CANONICAL_PROBLEM_PERSISTENCE_VERSION,
    persistence_state: "ready",
    publication_state: "not_published",
    problem: {
      problem_signature: draft.problem_signature,
      title: draft.title,
      summary: draft.summary,
      target_user: draft.target_user,
      situation: draft.situation,
      category: draft.category,
      status: "draft",
    },
    incidents,
    evidence: rows.sort((a, b) => a.source_signal_id.localeCompare(b.source_signal_id)),
    invariants: {
      source_count: actualSources.length,
      incident_count: actualIncidents.length,
      distinct_source_key_count: unique(rows.map((row) => row.source_key)).length,
    },
  };
}

function normalizeEvidence(value) {
  if (!value || typeof value !== "object") throw new TypeError("evidence row must be an object");
  const row = {
    source_signal_id: required(value.source_signal_id, "source_signal_id"),
    incident_key: required(value.incident_key, "incident_key"),
    excerpt: required(value.excerpt, "excerpt"),
    source_key: required(value.source_key, "source_key"),
    source_url: nullable(value.source_url),
    source_type: nullable(value.source_type),
    source_label: nullable(value.source_label),
    source_observed_at: nullable(value.source_observed_at),
    order_index: Number.isInteger(value.order_index) && value.order_index >= 0 ? value.order_index : null,
  };
  if (row.excerpt.length > 600) throw new RangeError("excerpt must be at most 600 characters");
  return row;
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function nullable(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort();
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
