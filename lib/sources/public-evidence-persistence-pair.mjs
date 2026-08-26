import assert from "node:assert/strict";

import {
  reconstructUniqueHistoricalSpan,
  sha256,
} from "./historical-evidence-span-readiness.mjs";
import { SOURCE_FULL_CONTEXT_FETCH_VERSION } from "./source-full-context-fetch.mjs";

export const PHASE15_8T_VERSION = "phase15.8t-public-evidence-persistence-v0.1";
export const PHASE15_8T_PROBLEM_SIGNATURE = "lodging_reservation_fulfillment_gap";
export const PHASE15_8T_EVIDENCE_AUTHORITIES = Object.freeze([
  Object.freeze({
    order_index: 0,
    incident_key: "agoda_reservation_fulfillment_gap_case",
    source_key_sha256: "9b3f68381755c64084d18df11e07c9a8248f31e518dda28533f18bfc20715e99",
    excerpt_length: 83,
    excerpt_sha256: "1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa",
    readiness_authority: "phase15.8s_public_evidence_readiness",
  }),
  Object.freeze({
    order_index: 1,
    incident_key: "yeogieottae_reservation_fulfillment_gap_case",
    source_key_sha256: "5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c",
    excerpt_length: 19,
    excerpt_sha256: "78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b",
    readiness_authority: "phase15.8s-x_historical_exact_span_readiness",
  }),
]);

export function validatePhase15_8TEvidenceAuthorities(authorities = PHASE15_8T_EVIDENCE_AUTHORITIES) {
  assert.equal(authorities.length, 2, "Phase 15.8T requires exactly two Evidence authorities");
  assert.deepEqual(authorities.map((item) => item.order_index), [0, 1], "Phase 15.8T order authority must be 0 then 1");
  assert.equal(new Set(authorities.map((item) => item.incident_key)).size, 2,
    "Phase 15.8T requires two distinct Incident authorities");
  assert.equal(new Set(authorities.map((item) => item.source_key_sha256)).size, 2,
    "Phase 15.8T requires two distinct Source authorities");
  for (const item of authorities) {
    assert.match(item.source_key_sha256, /^[0-9a-f]{64}$/);
    assert.match(item.excerpt_sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(item.excerpt_length) && item.excerpt_length >= 1 && item.excerpt_length <= 600);
  }
  return authorities;
}

export function reconstructPhase15_8TEvidence({ authority, incident, source, canonicalContext }) {
  assert.equal(incident?.incident_key, authority.incident_key,
    "Phase 15.8T Incident identity must match frozen readiness authority");
  assert.equal(source?.source_platform, "naver_blog", "Phase 15.8T currently expects Naver Blog Evidence Sources");
  const sourceKey = String(source?.canonical_url ?? "").trim();
  assert.ok(sourceKey, "Phase 15.8T Evidence Source requires canonical_url");
  assert.equal(sha256(sourceKey), authority.source_key_sha256,
    "Phase 15.8T Source identity drifted from frozen readiness authority");

  assert.equal(canonicalContext?.version, SOURCE_FULL_CONTEXT_FETCH_VERSION,
    "Phase 15.8T must use current full-context fetch authority");
  assert.equal(canonicalContext?.status, "resolved", "Phase 15.8T canonical context must resolve");
  assert.equal(canonicalContext?.content_scope, "full_post", "Phase 15.8T canonical context must be full_post");
  assert.equal(canonicalContext?.truncated, false, "Phase 15.8T canonical context must be untruncated");

  const reconstructed = reconstructUniqueHistoricalSpan(canonicalContext.content_text, {
    expectedLength: authority.excerpt_length,
    expectedSha256: authority.excerpt_sha256,
  });
  assert.equal(reconstructed.text.length, authority.excerpt_length);
  assert.equal(sha256(reconstructed.text), authority.excerpt_sha256);

  return {
    excerpt: reconstructed.text,
    source_signal_id: source.id,
    incident_id: incident.id,
    source_type: source.source_platform,
    source_label: canonicalContext.title ?? null,
    source_url: sourceKey,
    source_key: sourceKey,
    source_observed_at: source.published_at ?? null,
    order_index: authority.order_index,
  };
}

export function safePhase15_8TEvidenceReadback(row) {
  return {
    order_index: row.order_index,
    incident_key: row.incident_key,
    source_key_sha256: sha256(row.source_key),
    excerpt_length: row.excerpt.length,
    excerpt_sha256: sha256(row.excerpt),
    publication_basis: row.publication_basis,
    source_type: row.source_type,
    lineage_bound: Boolean(row.source_signal_id && row.incident_id),
  };
}
