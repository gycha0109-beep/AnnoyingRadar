import { createHash } from "node:crypto";

import {
  PHASE15_9I_BATCH_VERSION,
  PHASE15_9I_CANDIDATE_AUTHORITY,
  PHASE15_9I_SAMPLE_FINGERPRINT,
  PHASE15_9I_TARGET_COUNT,
  PHASE15_9I_TARGET_ORDINALS,
} from "./phase15-9i-confirmed-fn-outcome-persistence.mjs";

export const PHASE15_9J_VERSION = "phase15.9j-durable-candidate-formation-audit-v0.1";
export const PHASE15_9J_SOURCE_BATCH_VERSION = PHASE15_9I_BATCH_VERSION;
export const PHASE15_9J_SAMPLE_FINGERPRINT = PHASE15_9I_SAMPLE_FINGERPRINT;
export const PHASE15_9J_TARGET_ORDINALS = PHASE15_9I_TARGET_ORDINALS;
export const PHASE15_9J_TARGET_COUNT = PHASE15_9I_TARGET_COUNT;
export const PHASE15_9J_FETCHES_PER_SOURCE = 2;
export const PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS = PHASE15_9J_TARGET_COUNT * PHASE15_9J_FETCHES_PER_SOURCE * 4;
export const PHASE15_9J_MAX_MODEL_CALLS = PHASE15_9J_TARGET_COUNT * 2;
export const PHASE15_9J_EXPECTED_OUTCOME_TOTAL = 85;

const sha256 = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");

export function validatePhase15_9JOutcomeAuthority(rows) {
  if (!Array.isArray(rows) || rows.length !== PHASE15_9J_TARGET_COUNT) {
    throw new RangeError(`Phase 15.9J requires exactly ${PHASE15_9J_TARGET_COUNT} durable Candidate outcomes`);
  }

  const seenOrdinals = new Set();
  const validated = rows.map((row) => {
    const ordinal = findOrdinalByContextHash(row?.context_content_sha256);
    if (ordinal == null) throw new RangeError("Phase 15.9J outcome context hash is outside the frozen 15.9I authority");
    if (seenOrdinals.has(ordinal)) throw new RangeError("Phase 15.9J durable Candidate authority contains a duplicate ordinal");
    seenOrdinals.add(ordinal);

    const authority = PHASE15_9I_CANDIDATE_AUTHORITY[ordinal];
    assertEqual(row?.status, "resolved", "status");
    assertEqual(row?.decision, "candidate", "decision");
    assertReason(row?.reason_codes);
    assertEqual(row?.problem_claim, authority.semantic.problem_claim, "problem_claim");
    assertEqual(row?.experience_actor, authority.semantic.experience_actor, "experience_actor");
    assertEqual(row?.friction_cause, authority.semantic.friction_cause, "friction_cause");
    assertEqual(row?.friction_specificity, authority.semantic.friction_specificity, "friction_specificity");
    assertEqual(row?.pain_centrality, authority.semantic.pain_centrality, "pain_centrality");
    assertEqual(row?.content_kind, authority.semantic.content_kind, "content_kind");
    assertEqual(row?.context_status, "resolved", "context_status");
    assertEqual(row?.context_scope, "full_post", "context_scope");
    assertEqual(row?.context_content_sha256, authority.context_hash, "context_content_sha256");
    assertEqual(Number(row?.context_char_count), authority.context_chars, "context_char_count");
    assertEqual(row?.context_truncated, false, "context_truncated");

    const sourceSignalId = String(row?.source_signal_id ?? "").trim();
    if (!sourceSignalId) throw new RangeError("Phase 15.9J outcome requires source_signal_id");

    return {
      baseline_ordinal: ordinal,
      source_signal_id: sourceSignalId,
      prior_outcome: row,
      h_authority: authority,
    };
  });

  const ordered = validated.sort((left, right) => left.baseline_ordinal - right.baseline_ordinal);
  const actualOrdinals = ordered.map((item) => item.baseline_ordinal);
  if (actualOrdinals.join(",") !== PHASE15_9J_TARGET_ORDINALS.join(",")) {
    throw new RangeError("Phase 15.9J durable Candidate ordinals drifted from Phase 15.9I authority");
  }
  return ordered;
}

export function assertPhase15_9JContextIntegrity(first, second, target, { compareFetches }) {
  if (typeof compareFetches !== "function") throw new TypeError("compareFetches is required");
  const pair = compareFetches(first, second);
  if (!pair?.stable) throw new RangeError("Phase 15.9J requires a stable double-fetch pair");

  const authority = target?.h_authority;
  if (!authority) throw new TypeError("Phase 15.9J target authority is required");
  for (const [name, value] of [["first", first], ["second", second]]) {
    assertEqual(value?.status, "resolved", `${name}.status`);
    assertEqual(value?.truncated, false, `${name}.truncated`);
    assertEqual(value?.content_scope, "full_post", `${name}.content_scope`);
    assertEqual(value?.content_hash, authority.context_hash, `${name}.content_hash`);
    assertEqual(Number(value?.original_char_count), authority.context_chars, `${name}.original_char_count`);
    assertEqual(String(value?.content_text ?? "").length, authority.context_chars, `${name}.content_text.length`);
    assertEqual(value?.extraction_scope, authority.extraction_scope, `${name}.extraction_scope`);
    assertEqual(sha256(value?.title ?? ""), authority.title_sha256, `${name}.title_sha256`);
  }
  return pair;
}

export function buildPhase15_9JArtifactItem({ target, formationResult, context }) {
  const semantic = formationResult?.semantic ?? null;
  const quote = typeof semantic?.evidence_quote === "string" ? semantic.evidence_quote : null;
  return {
    baseline_ordinal: target.baseline_ordinal,
    prior_rejection_stratum: target.h_authority.rejection_stratum,
    formation_state: formationResult?.formation_state ?? "review",
    resolved: Boolean(formationResult?.resolved),
    reason_codes: [...(formationResult?.reason_codes ?? [])],
    formation_semantic: semantic ? {
      problem_claim: semantic.problem_claim,
      experience_actor: semantic.experience_actor,
      friction_specificity: semantic.friction_specificity,
      pain_centrality: semantic.pain_centrality,
      content_kind: semantic.content_kind,
      source_origin: semantic.source_origin,
      friction_responsibility: semantic.friction_responsibility,
      evidence_quote_sha256: quote ? sha256(quote) : null,
      evidence_quote_char_count: quote?.length ?? 0,
      evidence_quote_grounded: Boolean(quote && String(context?.content_text ?? "").includes(quote)),
    } : null,
    non_authoritative_proposals: semantic ? {
      problem_mechanism: semantic.problem_mechanism_proposal ?? null,
      incident_summary: semantic.incident_summary_proposal ?? null,
    } : null,
    context: {
      status: context?.status ?? "unavailable",
      content_scope: context?.content_scope ?? null,
      content_hash: context?.content_hash ?? null,
      original_char_count: context?.original_char_count ?? null,
      extraction_scope: context?.extraction_scope ?? null,
      truncated: Boolean(context?.truncated),
    },
    recovery: {
      attempted: Boolean(formationResult?.recovery?.attempted),
      recovered: Boolean(formationResult?.recovery?.recovered),
      attempt_count: Number(formationResult?.recovery?.attempt_count ?? 0),
      trigger_reason_code: formationResult?.recovery?.trigger_reason_code ?? null,
    },
  };
}

function findOrdinalByContextHash(value) {
  const normalized = String(value ?? "").trim();
  for (const ordinal of PHASE15_9J_TARGET_ORDINALS) {
    if (PHASE15_9I_CANDIDATE_AUTHORITY[ordinal].context_hash === normalized) return ordinal;
  }
  return null;
}

function assertReason(value) {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== "full_context_first_hand_external_friction") {
    throw new RangeError("Phase 15.9J requires the exact 15.9I Candidate reason authority");
  }
}

function assertEqual(actual, expected, name) {
  if (actual !== expected) throw new RangeError(`Phase 15.9J ${name} drifted from frozen authority`);
}
