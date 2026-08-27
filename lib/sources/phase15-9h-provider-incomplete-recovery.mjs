import { PHASE15_9G_SAMPLE_SIZE } from "./phase15-9g-semantic-rejection-diagnostics.mjs";

export const PHASE15_9H_VERSION = "phase15.9h-provider-incomplete-recovery-v0.1";
export const PHASE15_9H_BASELINE_PHASE = "15.9G";
export const PHASE15_9H_BASELINE_UNRESOLVED_ORDINALS = Object.freeze([1, 4, 5, 7, 8, 9, 10, 16]);
export const PHASE15_9H_BASELINE_REASON_COUNTS = Object.freeze({ source_full_context_provider_incomplete: 6, source_full_context_invalid_evidence_quote: 2 });
export const PHASE15_9H_PROVIDER_ONLY_RECOVERY_CODES = Object.freeze(["source_full_context_provider_incomplete"]);
export const PHASE15_9H_TARGET_COUNT = PHASE15_9H_BASELINE_UNRESOLVED_ORDINALS.length;
export const PHASE15_9H_FETCHES_PER_SOURCE = 2;
export const PHASE15_9H_MAX_MODEL_CALLS = PHASE15_9H_TARGET_COUNT * 2;

export function selectPhase15_9HTargets(sample) {
  if (!Array.isArray(sample) || sample.length !== PHASE15_9G_SAMPLE_SIZE) throw new RangeError(`Phase 15.9H requires the exact ${PHASE15_9G_SAMPLE_SIZE}-Source Phase 15.9G sample`);
  return PHASE15_9H_BASELINE_UNRESOLVED_ORDINALS.map((ordinal) => {
    const record = sample[ordinal - 1];
    if (!record) throw new RangeError(`Missing Phase 15.9G baseline ordinal ${ordinal}`);
    return { ...record, baseline_ordinal: ordinal };
  });
}

export function summarizePhase15_9H(results) {
  const summary = { total: results.length, fetch_pair_stable: 0, fetch_pair_unstable: 0, candidate: 0, review: 0, reject: 0, unavailable: 0, false_negative_confirmed: 0, false_negative_possible: 0, policy_consistent: 0, fresh_first_attempt_resolved: 0, provider_recovery_attempted: 0, provider_recovered_after_retry: 0, provider_recovery_exhausted: 0, quote_recovery_attempted: 0, decision_reason_counts: {}, terminal_recovery_reason_counts: {} };
  for (const item of results) {
    if (item.fetch_pair_stable) summary.fetch_pair_stable += 1; else summary.fetch_pair_unstable += 1;
    const recovery = item.recovery ?? {};
    if (!recovery.attempted && item.full_context_decision) summary.fresh_first_attempt_resolved += 1;
    if (recovery.attempted) summary.provider_recovery_attempted += 1;
    if (recovery.attempted && recovery.recovered) summary.provider_recovered_after_retry += 1;
    if (recovery.attempted && !recovery.recovered) summary.provider_recovery_exhausted += 1;
    if (recovery.trigger_reason_code === "source_full_context_invalid_evidence_quote") summary.quote_recovery_attempted += 1;
    const decision = item.full_context_decision;
    if (decision === "candidate") { summary.candidate += 1; summary.false_negative_confirmed += 1; }
    else if (decision === "review") { summary.review += 1; summary.false_negative_possible += 1; }
    else if (decision === "reject") { summary.reject += 1; summary.policy_consistent += 1; }
    else summary.unavailable += 1;
    for (const reason of item.decision_reason_codes ?? []) summary.decision_reason_counts[reason] = (summary.decision_reason_counts[reason] ?? 0) + 1;
    const terminal = recovery.terminal_reason_code;
    if (terminal) summary.terminal_recovery_reason_counts[terminal] = (summary.terminal_recovery_reason_counts[terminal] ?? 0) + 1;
  }
  return summary;
}

export function determinePhase15_9HConclusion(summary) {
  if (summary.false_negative_confirmed > 0) return "source_admission_false_negative_detected";
  if (summary.false_negative_possible > 0) return "possible_source_admission_false_negative";
  if (summary.unavailable > 0 || summary.fetch_pair_unstable > 0) return "provider_recovery_inconclusive_for_some_sources";
  return "recovered_sample_supports_current_source_admission_rejections";
}
