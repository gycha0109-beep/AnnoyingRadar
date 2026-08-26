import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPublicEvidenceJudgeRequest,
  judgePublicEvidenceExcerpt,
  PUBLIC_EVIDENCE_EXCERPT_MAX_CHARS,
  PublicEvidenceReadinessError,
  resolvePublicEvidenceReadiness,
} from "../lib/sources/public-evidence-readiness.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function signal() {
  return {
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/123456789012",
  };
}

function problem() {
  return {
    title: "숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다",
    summary: "예약이 완료된 것으로 인식했지만 실제 숙소 측 예약이 확보·반영되지 않은 문제가 발생한다.",
  };
}

function fullContext(text = "예약 완료 안내를 받았지만 숙소에 확인하니 실제 예약이 잡혀 있지 않았다. 다른 숙소를 다시 구해야 했다.") {
  return {
    status: "resolved",
    content_scope: "full_post",
    content_text: text,
    content_hash: "hash",
    original_char_count: text.length,
    truncated: false,
    title: "예약 누락 후기",
  };
}

test("15.8S prompt freezes exact contiguous excerpt and 600-char publication contract", () => {
  const request = buildPublicEvidenceJudgeRequest({
    title: "source title",
    fullText: "full body",
    sourcePlatform: "naver_blog",
    problemTitle: problem().title,
    problemSummary: problem().summary,
    model: "test-model",
  });
  const serialized = JSON.stringify(request.body);
  assert.match(serialized, /shortest exact contiguous excerpt/);
  assert.match(serialized, /Never rewrite, summarize, splice, redact, or combine non-contiguous passages/);
  assert.equal(
    request.body.text.format.schema.properties.evidence_excerpt.anyOf[0].maxLength,
    PUBLIC_EVIDENCE_EXCERPT_MAX_CHARS,
  );
});

test("judge accepts only an exact contiguous direct excerpt", async () => {
  const body = fullContext().content_text;
  const excerpt = "실제 예약이 잡혀 있지 않았다";
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "request-id" },
    json: async () => ({
      status: "completed",
      model: "test-model",
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ support_level: "direct", evidence_excerpt: excerpt }) }] }],
    }),
  });
  const result = await judgePublicEvidenceExcerpt({
    title: "source",
    fullText: body,
    sourcePlatform: "naver_blog",
    problemTitle: problem().title,
    problemSummary: problem().summary,
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });
  assert.deepEqual(result, { support_level: "direct", evidence_excerpt: excerpt });
});

test("judge rejects rewritten or non-contiguous excerpt", async () => {
  const body = fullContext().content_text;
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "request-id" },
    json: async () => ({
      status: "completed",
      model: "test-model",
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ support_level: "direct", evidence_excerpt: "숙소 예약이 최종적으로 누락되었다" }) }] }],
    }),
  });
  await assert.rejects(
    judgePublicEvidenceExcerpt({
      title: "source",
      fullText: body,
      sourcePlatform: "naver_blog",
      problemTitle: problem().title,
      problemSummary: problem().summary,
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    }),
    /exact contiguous excerpt/,
  );
});

test("readiness gate requires full untruncated context and direct support", async () => {
  const direct = await resolvePublicEvidenceReadiness(signal(), problem(), {
    fetchContext: async () => fullContext(),
    judgeContext: async () => ({
      support_level: "direct",
      evidence_excerpt: "실제 예약이 잡혀 있지 않았다",
    }),
  });
  assert.equal(direct.evidence_state, "ready");
  assert.equal(direct.ready, true);
  assert.deepEqual(direct.reason_codes, ["public_evidence_direct_exact_excerpt"]);

  const partial = await resolvePublicEvidenceReadiness(signal(), problem(), {
    fetchContext: async () => fullContext(),
    judgeContext: async () => ({ support_level: "partial", evidence_excerpt: null }),
  });
  assert.equal(partial.evidence_state, "review");
  assert.equal(partial.ready, false);

  const truncated = await resolvePublicEvidenceReadiness(signal(), problem(), {
    fetchContext: async () => ({ ...fullContext(), truncated: true }),
    judgeContext: async () => { throw new Error("must not be called"); },
  });
  assert.equal(truncated.evidence_state, "review");
  assert.deepEqual(truncated.reason_codes, ["public_evidence_full_post_truncated"]);
});

test("only provider-incomplete failures receive the bounded semantic retry", async () => {
  let attempts = 0;
  const result = await resolvePublicEvidenceReadiness(signal(), problem(), {
    fetchContext: async () => fullContext(),
    judgeContext: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new PublicEvidenceReadinessError(
          "public_evidence_provider_incomplete",
          "incomplete",
          { retryable: true },
        );
      }
      return { support_level: "direct", evidence_excerpt: "실제 예약이 잡혀 있지 않았다" };
    },
    maxSemanticAttempts: 2,
  });
  assert.equal(attempts, 2);
  assert.equal(result.ready, true);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.recovered, true);
});

test("15.8S runner is structurally read-only and hides identity/full-body data from artifact", async () => {
  const script = await read("scripts/run-public-evidence-readiness-15-8s.mjs");
  assert.doesNotMatch(script, /\.rpc\(/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\n\s*\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /assert\.deepEqual\(after, before/);
  assert.match(script, /public_evidence_rows_written: 0/);
  assert.match(script, /publication_mutations: 0/);
  assert.match(script, /full_source_bodies_persisted: 0/);
  assert.match(script, /source_key_sha256/);
  assert.match(script, /evidence_excerpt/);
  assert.match(script, /source_signal_id/);
  assert.match(script, /assertSafeArtifactItem/);
});

test("15.8S workflow is authoritative-main and manual-only after closeout", async () => {
  const workflow = await read(".github/workflows/source-public-evidence-readiness-15-8s.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /agent\/phase15-8s-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PAID_PUBLIC_EVIDENCE_READINESS: "true"/);
  assert.match(workflow, /OPENAI_PUBLIC_EVIDENCE_MODEL/);
  assert.match(workflow, /run-public-evidence-readiness-15-8s\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
});
