import { SOURCE_FULL_CONTEXT_RECOVERY_VERSION } from "./source-full-context-recovery.mjs";
import {
  SOURCE_FULL_CONTEXT_PROMPT_VERSION,
  SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
} from "./source-full-context-resolution.mjs";

export const PHASE15_9I_VERSION = "phase15.9i-confirmed-fn-outcome-persistence-v0.1";
export const PHASE15_9I_BATCH_VERSION = "phase15.9i-confirmed-false-negative-candidates-v0.1";
export const PHASE15_9I_BASELINE_PHASE = "15.9H";
export const PHASE15_9I_SAMPLE_FINGERPRINT = "2a96219b35056ebd9b8947363477cb59615833890ab10636cf7e151b4c17218e";
export const PHASE15_9I_TARGET_ORDINALS = Object.freeze([4, 9, 16]);
export const PHASE15_9I_TARGET_COUNT = PHASE15_9I_TARGET_ORDINALS.length;
export const PHASE15_9I_FETCHES_PER_SOURCE = 2;
export const PHASE15_9I_MAX_SOURCE_NETWORK_REQUESTS = PHASE15_9I_TARGET_COUNT * PHASE15_9I_FETCHES_PER_SOURCE * 4;
export const PHASE15_9I_MODEL_CALLS = 0;

export const PHASE15_9I_CANDIDATE_AUTHORITY = Object.freeze({
  4: Object.freeze({
    rejection_stratum: "title_no_complaint_signal",
    context_hash: "41f15cace5262a57cdd1fc439c2b61caf0b101b20d1b9595552c7c8802dcc1eb",
    context_chars: 5752,
    extraction_scope: "main_element",
    title_sha256: "c75c730c0c0321bd7a3902bad30a9c28cbf335953f6b36cd4885ddb51537f9ff",
    semantic: Object.freeze({
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
    }),
    recovery: Object.freeze({
      version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
      attempted: true,
      recovered: true,
      attempt_count: 2,
      trigger_reason_code: "source_full_context_provider_incomplete",
      terminal_reason_code: null,
    }),
  }),
  9: Object.freeze({
    rejection_stratum: "title_truncated_no_complaint_signal",
    context_hash: "4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463",
    context_chars: 3407,
    extraction_scope: "content_container",
    title_sha256: "309927f9a8f9359310e90f53078eb5c2c178dc6a1c70ddd2eb8b112c15e22988",
    semantic: Object.freeze({
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
    }),
    recovery: Object.freeze({
      version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
      attempted: false,
      recovered: false,
      attempt_count: 1,
      trigger_reason_code: null,
      terminal_reason_code: null,
    }),
  }),
  16: Object.freeze({
    rejection_stratum: "title_information_or_guide",
    context_hash: "cff1a57a383f6a903e6828117bf5115a04d412d54241982bf463748b97dea53c",
    context_chars: 3149,
    extraction_scope: "article_element",
    title_sha256: "cc886d2f25206da7d5269718779383532ff09b759b3eca34fc121d60232a2d9e",
    semantic: Object.freeze({
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
    }),
    recovery: Object.freeze({
      version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
      attempted: false,
      recovered: false,
      attempt_count: 1,
      trigger_reason_code: null,
      terminal_reason_code: null,
    }),
  }),
});

export function selectPhase15_9ICandidateTargets(sample) {
  if (!Array.isArray(sample) || sample.length !== 16) {
    throw new RangeError("Phase 15.9I requires the exact 16-Source Phase 15.9G sample");
  }
  return PHASE15_9I_TARGET_ORDINALS.map((ordinal) => {
    const record = sample[ordinal - 1];
    if (!record) throw new RangeError(`Missing Phase 15.9G sample ordinal ${ordinal}`);
    return {
      ...record,
      baseline_ordinal: ordinal,
      h_authority: PHASE15_9I_CANDIDATE_AUTHORITY[ordinal],
    };
  });
}

export function buildPhase15_9IFrozenCandidateResult(authority, fullContext, {
  model = "gpt-5-mini-2025-08-07",
} = {}) {
  if (!authority || typeof authority !== "object") throw new TypeError("H candidate authority is required");
  if (fullContext?.status !== "resolved" || fullContext?.content_scope !== "full_post") {
    throw new RangeError("Phase 15.9I requires resolved full_post context");
  }
  return {
    version: SOURCE_FULL_CONTEXT_RECOVERY_VERSION,
    base_resolution_version: SOURCE_FULL_CONTEXT_RESOLUTION_VERSION,
    status: "resolved",
    decision: "candidate",
    resolved: true,
    full_context: fullContext,
    semantic: {
      ...authority.semantic,
      evidence_quote: null,
      prompt_version: SOURCE_FULL_CONTEXT_PROMPT_VERSION,
      provider: "openai",
      model,
    },
    recovery: { ...authority.recovery },
    reason_codes: ["full_context_first_hand_external_friction"],
  };
}
