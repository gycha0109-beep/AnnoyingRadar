import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertStableCanonicalContexts,
  buildCombinedEvidenceReadiness,
  createResidualBudgetFetch,
  PHASE15_8S_R_CONTEXT_STABILITY_FETCHES,
  PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256,
  PHASE15_8S_R_INCIDENT_KEY,
  PHASE15_8S_R_MAX_OUTPUT_TOKENS,
  PHASE15_8S_R_PRIOR_READY,
  PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH,
  PHASE15_8S_R_VERSION,
} from "../lib/sources/public-evidence-residual.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function canonicalContext(overrides = {}) {
  const contentText = "예약 완료 안내를 받았지만 실제 숙소 예약은 확인되지 않았습니다.";
  return {
    version: "source-full-context-fetch-v0.2",
    status: "resolved",
    content_scope: "full_post",
    truncated: false,
    content_text: contentText,
    content_hash: "a".repeat(64),
    original_char_count: contentText.length,
    title: "예약 누락 후기",
    ...overrides,
  };
}

test("15.8S-R v0.2 targets exactly the one provider-incomplete residual authority", () => {
  assert.equal(PHASE15_8S_R_VERSION, "phase15.8s-r-evidence-residual-v0.2");
  assert.equal(PHASE15_8S_R_INCIDENT_KEY, "yeogieottae_reservation_fulfillment_gap_case");
  assert.equal(PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH, "8c9db5684507752f2e9d77af3de5968ff25622a4ad6c923630acac5af8ad640f");
  assert.equal(PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256, "5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c");
  assert.equal(PHASE15_8S_R_CONTEXT_STABILITY_FETCHES, 2);
  assert.equal(PHASE15_8S_R_PRIOR_READY.incident_key, "agoda_reservation_fulfillment_gap_case");
  assert.equal(PHASE15_8S_R_PRIOR_READY.excerpt_length, 83);
  assert.equal(PHASE15_8S_R_PRIOR_READY.excerpt_sha256, "1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa");
});

test("15.8S-R accepts only two byte-identical current canonical contexts", () => {
  const first = canonicalContext();
  const second = canonicalContext();
  assert.equal(assertStableCanonicalContexts(first, second), first);

  assert.throws(
    () => assertStableCanonicalContexts(first, canonicalContext({ content_hash: "b".repeat(64) })),
    /stable across two independent fetches/,
  );
  assert.throws(
    () => assertStableCanonicalContexts(first, canonicalContext({ content_text: `${first.content_text} 수정` })),
    /byte-identical/,
  );
  assert.throws(
    () => assertStableCanonicalContexts(first, canonicalContext({ version: "source-full-context-fetch-v0.1" })),
    /current fetch authority/,
  );
});

test("15.8S-R changes only the completion budget on the original observer request", async () => {
  let captured = null;
  const wrapped = createResidualBudgetFetch(async (_url, options) => {
    captured = JSON.parse(options.body);
    return { ok: true };
  });
  await wrapped("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({ model: "test", max_output_tokens: 800, input: [] }),
  });
  assert.equal(PHASE15_8S_R_MAX_OUTPUT_TOKENS, 4000);
  assert.equal(captured.max_output_tokens, 4000);
  assert.equal(captured.model, "test");
  assert.deepEqual(captured.input, []);
});

test("15.8S-R refuses to operate on a request that is not the original 800-token observer shape", async () => {
  const wrapped = createResidualBudgetFetch(async () => ({ ok: true }));
  await assert.rejects(
    wrapped("https://api.openai.com/v1/responses", {
      body: JSON.stringify({ max_output_tokens: 900 }),
    }),
    /exact original 800-token observer request shape/,
  );
});

test("combined readiness remains blocked until the residual item is exact-ready", () => {
  const notReady = buildCombinedEvidenceReadiness({
    incident_key: PHASE15_8S_R_INCIDENT_KEY,
    source_key_sha256: PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256,
    ready: false,
  });
  assert.equal(notReady.ready_count, 1);
  assert.equal(notReady.all_evidence_ready, false);
  assert.equal(notReady.would_meet_current_publication_cardinality_if_exact_plans_were_persisted, false);

  const ready = buildCombinedEvidenceReadiness({
    incident_key: PHASE15_8S_R_INCIDENT_KEY,
    source_key_sha256: PHASE15_8S_R_EXPECTED_SOURCE_KEY_SHA256,
    ready: true,
  });
  assert.equal(ready.ready_count, 2);
  assert.equal(ready.all_evidence_ready, true);
  assert.equal(ready.distinct_source_key_fingerprints, 2);
  assert.equal(ready.distinct_incident_keys, 2);
  assert.equal(ready.would_meet_current_publication_cardinality_if_exact_plans_were_persisted, true);
});

test("15.8S-R runner is one-item, two-context-fetch, one-semantic-call, read-only, and artifact-safe", async () => {
  const script = await read("scripts/run-public-evidence-residual-15-8s-r.mjs");
  assert.match(script, /PHASE15_8S_R_INCIDENT_KEY/);
  assert.match(script, /PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH/);
  assert.match(script, /PHASE15_8S_R_CONTEXT_STABILITY_FETCHES/);
  assert.match(script, /assertStableCanonicalContexts/);
  assert.match(script, /canonicalContexts\.push\(await fetchSourceFullContext\(pair\.source\)\)/);
  assert.match(script, /canonicalContexts\.length, 2/);
  assert.match(script, /maxSemanticAttempts: 1/);
  assert.match(script, /residual_attempt_count: 1/);
  assert.match(script, /prior_phase_attempt_count: 2/);
  assert.match(script, /context_stability_fetch_count/);
  assert.match(script, /stable_context: true/);
  assert.doesNotMatch(script, /item\.context_hash, PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH/);
  assert.doesNotMatch(script, /\.rpc\(/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\n\s*\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /public_evidence_rows_written: 0/);
  assert.match(script, /publication_mutations: 0/);
  assert.match(script, /exact_excerpt_persisted_in_artifact: false/);
  assert.match(script, /"evidence_excerpt"/);
  assert.match(script, /assertSafeArtifact/);
});

test("15.8S-R workflow is authoritative-main with one temporary live branch", async () => {
  const workflow = await read(".github/workflows/source-public-evidence-residual-15-8s-r.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8s-r-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PAID_PUBLIC_EVIDENCE_RESIDUAL: "true"/);
  assert.match(workflow, /run-public-evidence-residual-15-8s-r\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
});
