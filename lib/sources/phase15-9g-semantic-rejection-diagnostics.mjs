import { PHASE15_9D_REJECTION_STRATA } from "./phase15-9d-rejection-diagnostics.mjs";
import { PHASE15_9F_SAMPLE_SIZE } from "./phase15-9f-external-web-pilot.mjs";

export const PHASE15_9G_VERSION = "phase15.9g-external-semantic-rejection-diagnostics-v0.1";
export const PHASE15_9G_SAMPLE_SIZE = PHASE15_9F_SAMPLE_SIZE;
export const PHASE15_9G_FETCHES_PER_SOURCE = 2;
export const PHASE15_9G_MAX_MODEL_CALLS = PHASE15_9G_SAMPLE_SIZE;
export const PHASE15_9G_REJECTION_STRATA = PHASE15_9D_REJECTION_STRATA;

export function comparePhase15_9GFetches(first, second) {
  const comparable = [first, second].every((item) => item?.status === "resolved" && item?.content_text && !item?.truncated);
  if (!comparable) {
    return {
      stable: false,
      reason: "full_context_pair_unavailable",
      first_status: first?.status ?? null,
      second_status: second?.status ?? null,
    };
  }

  const stable = first.content_hash === second.content_hash
    && first.original_char_count === second.original_char_count
    && first.extraction_scope === second.extraction_scope
    && String(first.title ?? "") === String(second.title ?? "");

  return {
    stable,
    reason: stable ? "full_context_pair_stable" : "full_context_pair_changed",
    first_status: first.status,
    second_status: second.status,
  };
}

export function summarizePhase15_9G(results) {
  const summary = {
    total: results.length,
    fetch_pair_stable: 0,
    fetch_pair_unstable: 0,
    model_call_attempted: 0,
    candidate: 0,
    review: 0,
    reject: 0,
    unavailable: 0,
    false_negative_confirmed: 0,
    false_negative_possible: 0,
    policy_consistent: 0,
    decision_reason_counts: {},
  };

  for (const item of results) {
    if (item.fetch_pair_stable) summary.fetch_pair_stable += 1;
    else summary.fetch_pair_unstable += 1;
    if (item.model_call_attempted) summary.model_call_attempted += 1;

    const decision = item.full_context_decision;
    if (decision === "candidate") {
      summary.candidate += 1;
      summary.false_negative_confirmed += 1;
    } else if (decision === "review") {
      summary.review += 1;
      summary.false_negative_possible += 1;
    } else if (decision === "reject") {
      summary.reject += 1;
      summary.policy_consistent += 1;
    } else {
      summary.unavailable += 1;
    }

    for (const reason of item.decision_reason_codes ?? []) {
      summary.decision_reason_counts[reason] = (summary.decision_reason_counts[reason] ?? 0) + 1;
    }
  }
  return summary;
}

export function determinePhase15_9GConclusion(summary) {
  if (summary.false_negative_confirmed > 0) return "source_admission_false_negative_detected";
  if (summary.false_negative_possible > 0) return "possible_source_admission_false_negative";
  if (summary.unavailable > 0 || summary.fetch_pair_unstable > 0) return "diagnostic_inconclusive_for_some_sources";
  return "sample_supports_current_source_admission_rejections";
}
