import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HISTORICAL_EVIDENCE_SPAN_PROMPT_VERSION,
  HISTORICAL_EVIDENCE_SPAN_READINESS_VERSION,
  PHASE15_8S_X_CONTEXT_STABILITY_FETCHES,
  PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256,
  PHASE15_8S_X_HISTORICAL_SPAN_LENGTH,
  PHASE15_8S_X_HISTORICAL_SPAN_SHA256,
  PHASE15_8S_X_INCIDENT_KEY,
  assertStableCanonicalContexts,
  buildHistoricalFixedSpanJudgeRequest,
  decideHistoricalSpanReadiness,
  reconstructUniqueHistoricalSpan,
  sha256,
} from "../lib/sources/historical-evidence-span-readiness.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function canonicalContext(overrides = {}) {
  const contentText = "앞문장 고정된근거문장 뒷문장";
  return {
    version: "source-full-context-fetch-v0.2",
    status: "resolved",
    content_scope: "full_post",
    truncated: false,
    content_text: contentText,
    content_hash: sha256(contentText),
    original_char_count: contentText.length,
    title: "예약 누락 후기",
    ...overrides,
  };
}

test("15.8S-X freezes the exact historical authority by hash and length only", () => {
  assert.equal(HISTORICAL_EVIDENCE_SPAN_READINESS_VERSION, "historical-evidence-span-readiness-v0.1");
  assert.equal(HISTORICAL_EVIDENCE_SPAN_PROMPT_VERSION, "historical-evidence-fixed-span-support-v0.1");
  assert.equal(PHASE15_8S_X_INCIDENT_KEY, "yeogieottae_reservation_fulfillment_gap_case");
  assert.equal(PHASE15_8S_X_EXPECTED_SOURCE_KEY_SHA256, "5b8e2799dfad399118f6a644d064fbd91e55a1870661721f910c7278b0e0616c");
  assert.equal(PHASE15_8S_X_HISTORICAL_SPAN_LENGTH, 19);
  assert.equal(PHASE15_8S_X_HISTORICAL_SPAN_SHA256, "78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b");
  assert.equal(PHASE15_8S_X_CONTEXT_STABILITY_FETCHES, 2);
});

test("historical span reconstruction requires exactly one current canonical match", () => {
  const span = "고정된근거문장";
  const text = `시작 ${span} 종료`;
  const match = reconstructUniqueHistoricalSpan(text, {
    expectedLength: span.length,
    expectedSha256: sha256(span),
  });
  assert.equal(match.text, span);
  assert.equal(match.index, text.indexOf(span));

  assert.throws(
    () => reconstructUniqueHistoricalSpan(`${span} / ${span}`, {
      expectedLength: span.length,
      expectedSha256: sha256(span),
    }),
    /must reconstruct uniquely/,
  );
  assert.throws(
    () => reconstructUniqueHistoricalSpan("다른 문장만 존재", {
      expectedLength: span.length,
      expectedSha256: sha256(span),
    }),
    /must reconstruct uniquely/,
  );
});

test("15.8S-X requires two byte-identical v0.2 canonical contexts", () => {
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

test("fixed-span observer cannot generate or replace an Evidence excerpt", () => {
  const request = buildHistoricalFixedSpanJudgeRequest({
    sourcePlatform: "naver_blog",
    sourceTitle: "source",
    fullText: "본문 고정 span 본문",
    fixedSpan: "고정 span",
    problemTitle: "problem",
    problemSummary: "summary",
    model: "test-model",
  });
  const schema = request.body.text.format.schema;
  assert.deepEqual(schema.required, ["support_level"]);
  assert.deepEqual(Object.keys(schema.properties), ["support_level"]);
  assert.equal(request.body.store, false);
  assert.equal(request.body.max_output_tokens, 800);
  assert.equal(JSON.stringify(schema).includes("evidence_excerpt"), false);
});

test("only direct support can make the fixed historical span ready", () => {
  assert.deepEqual(decideHistoricalSpanReadiness({ support_level: "direct" }), {
    evidence_state: "ready",
    ready: true,
    reason_code: "historical_evidence_fixed_exact_span_direct",
  });
  assert.equal(decideHistoricalSpanReadiness({ support_level: "partial" }).evidence_state, "review");
  assert.equal(decideHistoricalSpanReadiness({ support_level: "none" }).evidence_state, "blocked");
  assert.equal(decideHistoricalSpanReadiness({ support_level: "unclear" }).evidence_state, "review");
});

test("15.8S-X runner is one-source, two-fetch, one-call, read-only and artifact-safe", async () => {
  const script = await read("scripts/run-historical-evidence-span-readiness-15-8s-x.mjs");
  assert.match(script, /PHASE15_8S_X_INCIDENT_KEY/);
  assert.match(script, /PHASE15_8S_X_HISTORICAL_SPAN_LENGTH/);
  assert.match(script, /PHASE15_8S_X_HISTORICAL_SPAN_SHA256/);
  assert.match(script, /contexts\.push\(await fetchSourceFullContext\(pair\.source\)\)/);
  assert.match(script, /contexts\.length, 2/);
  assert.match(script, /reconstructUniqueHistoricalSpan\(canonicalContext\.content_text\)/);
  assert.match(script, /judgeHistoricalFixedSpanSupport/);
  assert.match(script, /semantic_attempt_count: 1/);
  assert.match(script, /fixed_span_generated_by_model: false/);
  assert.match(script, /fixed_span_text_persisted: false/);
  assert.doesNotMatch(script, /\.rpc\(/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\n\s*\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /public_evidence_rows_written: 0/);
  assert.match(script, /publication_mutations: 0/);
});

test("15.8S-X repository files retain historical span text privacy", async () => {
  const [lib, script, workflow] = await Promise.all([
    read("lib/sources/historical-evidence-span-readiness.mjs"),
    read("scripts/run-historical-evidence-span-readiness-15-8s-x.mjs"),
    read(".github/workflows/source-historical-evidence-span-readiness-15-8s-x.yml"),
  ]);
  for (const text of [lib, script, workflow]) {
    assert.doesNotMatch(text, /0f33f4e4-dd0c-42f5-b14b-ac8d2e6fde45/);
    assert.doesNotMatch(text, /<fixed_exact_span>예약/);
  }
});

test("15.8S-X workflow has one temporary live trigger and checks out authoritative main", async () => {
  const workflow = await read(".github/workflows/source-historical-evidence-span-readiness-15-8s-x.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8s-x-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PAID_HISTORICAL_EVIDENCE_SPAN_READINESS: "true"/);
  assert.match(workflow, /run-historical-evidence-span-readiness-15-8s-x\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
});
