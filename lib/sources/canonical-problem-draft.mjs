export const CANONICAL_PROBLEM_DRAFT_VERSION = "canonical-problem-draft-v0.1";
export const CANONICAL_PROBLEM_DRAFT_STATES = Object.freeze(["ready", "blocked", "review"]);

const TITLE_MAX = 240;
const SUMMARY_MAX = 4_000;

/**
 * Builds a curator-facing, non-persisted draft proposal.
 *
 * This function does not synthesize problem text, assign incident identity,
 * write to Supabase, or publish anything. It only decides whether a supplied
 * proposal is supported by an already incident-aware repeated cluster.
 */
export function evaluateCanonicalProblemDraft({ cluster, proposal } = {}) {
  const problemSignature = cleanText(cluster?.problem_signature);
  const title = cleanText(proposal?.title);
  const summary = cleanText(proposal?.summary);
  const targetUser = cleanNullableText(proposal?.target_user);
  const situation = cleanNullableText(proposal?.situation);
  const category = cleanNullableText(proposal?.category);
  const sourceIds = uniqueCleanStrings(cluster?.source_signal_ids);
  const incidentKeys = uniqueCleanStrings(cluster?.incident_keys);
  const sourceCount = Number.isInteger(cluster?.source_count) ? cluster.source_count : sourceIds.length;
  const incidentCount = Number.isInteger(cluster?.incident_count) ? cluster.incident_count : incidentKeys.length;

  if (!problemSignature) {
    return blocked("draft_problem_signature_required");
  }
  if (!cluster?.repeat_eligible || incidentCount < 2) {
    return blocked("draft_requires_two_independent_incidents", {
      problemSignature,
      sourceIds,
      incidentKeys,
      sourceCount,
      incidentCount,
    });
  }
  if (incidentKeys.length < 2 || incidentKeys.length !== incidentCount) {
    return review("draft_incident_identity_incomplete", {
      problemSignature,
      sourceIds,
      incidentKeys,
      sourceCount,
      incidentCount,
    });
  }
  if (sourceIds.length < 2 || sourceIds.length !== sourceCount) {
    return review("draft_source_identity_incomplete", {
      problemSignature,
      sourceIds,
      incidentKeys,
      sourceCount,
      incidentCount,
    });
  }
  if (!title) {
    return blocked("draft_title_required", { problemSignature, sourceIds, incidentKeys, sourceCount, incidentCount });
  }
  if (!summary) {
    return blocked("draft_summary_required", { problemSignature, sourceIds, incidentKeys, sourceCount, incidentCount });
  }
  if (title.length > TITLE_MAX) {
    return blocked("draft_title_too_long", { problemSignature, sourceIds, incidentKeys, sourceCount, incidentCount });
  }
  if (summary.length > SUMMARY_MAX) {
    return blocked("draft_summary_too_long", { problemSignature, sourceIds, incidentKeys, sourceCount, incidentCount });
  }

  return {
    version: CANONICAL_PROBLEM_DRAFT_VERSION,
    draft_state: "ready",
    resolved: true,
    reason_codes: ["draft_supported_by_independent_incidents"],
    draft: {
      problem_signature: problemSignature,
      title,
      summary,
      target_user: targetUser,
      situation,
      category,
      source_signal_ids: sourceIds,
      incident_keys: incidentKeys,
      source_count: sourceCount,
      incident_count: incidentCount,
      persistence_state: "not_persisted",
      publication_state: "not_published",
    },
  };
}

export function buildCanonicalProblemDraftQueue({ clusters, proposalsBySignature } = {}) {
  const proposals = proposalsBySignature && typeof proposalsBySignature === "object"
    ? proposalsBySignature
    : {};

  return (clusters ?? [])
    .map((cluster) => evaluateCanonicalProblemDraft({
      cluster,
      proposal: proposals[cluster?.problem_signature] ?? null,
    }))
    .filter((result) => result.draft_state === "ready")
    .sort((left, right) => left.draft.problem_signature.localeCompare(right.draft.problem_signature));
}

function blocked(reasonCode, context = {}) {
  return outcome("blocked", true, reasonCode, context);
}

function review(reasonCode, context = {}) {
  return outcome("review", false, reasonCode, context);
}

function outcome(state, resolved, reasonCode, context) {
  return {
    version: CANONICAL_PROBLEM_DRAFT_VERSION,
    draft_state: state,
    resolved,
    reason_codes: [reasonCode],
    context: {
      problem_signature: context.problemSignature ?? null,
      source_signal_ids: context.sourceIds ?? [],
      incident_keys: context.incidentKeys ?? [],
      source_count: context.sourceCount ?? 0,
      incident_count: context.incidentCount ?? 0,
    },
    draft: null,
  };
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNullableText(value) {
  return cleanText(value);
}

function uniqueCleanStrings(values) {
  return [...new Set((values ?? []).map(cleanText).filter(Boolean))].sort();
}
