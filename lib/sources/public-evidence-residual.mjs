import assert from "node:assert/strict";

import { judgePublicEvidenceExcerpt } from "./public-evidence-readiness.mjs";
import { SOURCE_FULL_CONTEXT_FETCH_VERSION } from "./source-full-context-fetch.mjs";

export const PHASE15_8S_R_VERSION = "phase15.8s-r-evidence-residual-v0.2";
export const PHASE15_8S_R_INCIDENT_KEY = "yeogieottae_reservation_fulfillment_gap_case";
export const PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH = "8c9db5684507752f2e9d77af3de5968ff25622a4ad6c923630acac5af8ad640f";
export const PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256 = "5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c";
export const PHASE15_8S_R_MAX_OUTPUT_TOKENS = 4_000;
export const PHASE15_8S_R_CONTEXT_STABILITY_FETCHES = 2;
export const PHASE15_8S_R_PRIOR_READY = Object.freeze({
  incident_key: "agoda_reservation_fulfillment_gap_case",
  excerpt_length: 83,
  excerpt_sha256: "1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa",
  source_key_sha256: "9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99",
});

export function assertStableCanonicalContexts(first, second) {
  for (const [ordinal, context] of [[1, first], [2, second]]) {
    assert.equal(context?.status, "resolved", `15.8S-R canonical context fetch ${ordinal} must resolve`);
    assert.equal(context?.version, SOURCE_FULL_CONTEXT_FETCH_VERSION,
      `15.8S-R canonical context fetch ${ordinal} must use current fetch authority`);
    assert.equal(context?.content_scope, "full_post", `15.8S-R canonical context fetch ${ordinal} must be full_post`);
    assert.equal(context?.truncated, false, `15.8S-R canonical context fetch ${ordinal} must be untruncated`);
    assert.ok(String(context?.content_hash ?? "").match(/^[0-9a-f]{64}$/),
      `15.8S-R canonical context fetch ${ordinal} must expose a content hash`);
    assert.ok(Number.isInteger(context?.original_char_count) && context.original_char_count > 0,
      `15.8S-R canonical context fetch ${ordinal} must expose a positive char count`);
  }

  assert.equal(first.content_hash, second.content_hash,
    "15.8S-R canonical full context must be stable across two independent fetches");
  assert.equal(first.original_char_count, second.original_char_count,
    "15.8S-R canonical full-context length must be stable across two independent fetches");
  assert.equal(first.title ?? null, second.title ?? null,
    "15.8S-R canonical full-context title must be stable across two independent fetches");
  assert.equal(first.content_text, second.content_text,
    "15.8S-R canonical full-context text must be byte-identical across two independent fetches");
  return first;
}

export function createResidualBudgetFetch(fetchImpl = globalThis.fetch, maxOutputTokens = PHASE15_8S_R_MAX_OUTPUT_TOKENS) {
  assert.equal(typeof fetchImpl, "function", "residual budget fetch requires fetch implementation");
  assert.ok(Number.isInteger(maxOutputTokens) && maxOutputTokens > 800 && maxOutputTokens <= 8_000,
    "residual max_output_tokens must be a bounded increase above the original 800-token budget");

  return async (url, options = {}) => {
    const body = JSON.parse(String(options.body ?? "{}"));
    assert.equal(body.max_output_tokens, 800, "15.8S-R only recovers the exact original 800-token observer request shape");
    body.max_output_tokens = maxOutputTokens;
    return fetchImpl(url, { ...options, body: JSON.stringify(body) });
  };
}

export function createResidualEvidenceJudge({ apiKey, model, timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  const residualFetch = createResidualBudgetFetch(fetchImpl);
  return (input) => judgePublicEvidenceExcerpt({
    ...input,
    apiKey,
    model,
    timeoutMs,
    fetchImpl: residualFetch,
  });
}

export function buildCombinedEvidenceReadiness(residualItem) {
  const residualReady = Boolean(residualItem?.ready);
  const sourceKeys = [PHASE15_8S_R_PRIOR_READY.source_key_sha256];
  const incidentKeys = [PHASE15_8S_R_PRIOR_READY.incident_key];
  if (residualItem?.source_key_sha256) sourceKeys.push(residualItem.source_key_sha256);
  if (residualItem?.incident_key) incidentKeys.push(residualItem.incident_key);

  return {
    total_required: 2,
    ready_count: residualReady ? 2 : 1,
    all_evidence_ready: residualReady,
    distinct_source_key_fingerprints: new Set(sourceKeys).size,
    distinct_incident_keys: new Set(incidentKeys).size,
    prior_ready: PHASE15_8S_R_PRIOR_READY,
    residual_ready: residualReady,
    would_meet_current_publication_cardinality_if_exact_plans_were_persisted:
      residualReady
      && new Set(sourceKeys).size === 2
      && new Set(incidentKeys).size === 2,
  };
}
