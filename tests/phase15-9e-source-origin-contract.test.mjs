import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeNaverBlogItem } from "../lib/sources/naver-blog-adapter.mjs";
import {
  classifySourceOrigin,
  resolveSignalSourceOrigin,
  SOURCE_ORIGIN_CLASSIFIER_VERSION,
} from "../lib/sources/source-origin.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_DISPATCH_VERSION,
  SOURCE_FULL_CONTEXT_FETCH_VERSION,
} from "../lib/sources/source-full-context-fetch.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9E separates actual content origin from discovery provider namespace", () => {
  assert.equal(SOURCE_ORIGIN_CLASSIFIER_VERSION, "source-origin-v0.1");
  assert.deepEqual(classifySourceOrigin("https://blog.naver.com/sample/224333944655"), {
    kind: "naver_blog",
    host: "blog.naver.com",
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
  });
  assert.deepEqual(classifySourceOrigin("https://m.blog.naver.com/sample/224333944655"), {
    kind: "naver_blog",
    host: "m.blog.naver.com",
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
  });
  assert.deepEqual(classifySourceOrigin("https://Example.Tistory.com/post/1"), {
    kind: "external_web",
    host: "example.tistory.com",
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
  });
  assert.equal(classifySourceOrigin("not-a-url"), null);
  assert.equal(classifySourceOrigin("ftp://example.com/a"), null);
});

test("15.9E Naver search normalization retains provider identity while recording actual origin", () => {
  const naver = normalizeNaverBlogItem({
    title: "예약 문제 후기",
    link: "https://blog.naver.com/sample/224333944655",
    description: "예약이 반영되지 않았습니다.",
    bloggername: "작성자",
    postdate: "20260827",
  });
  const external = normalizeNaverBlogItem({
    title: "통신사 해지 후기",
    link: "https://sample.tistory.com/42",
    description: "해지 과정이 오래 걸렸습니다.",
    bloggername: "작성자",
    postdate: "20260827",
  });

  assert.equal(naver.source_platform, "naver_blog");
  assert.equal(naver.source_metadata.provider, "naver_api_hub");
  assert.equal(naver.source_metadata.resource, "blog_search");
  assert.equal(naver.source_origin_kind, "naver_blog");
  assert.equal(naver.source_origin_host, "blog.naver.com");
  assert.equal(naver.source_origin_classifier_version, SOURCE_ORIGIN_CLASSIFIER_VERSION);

  assert.equal(external.source_platform, "naver_blog");
  assert.equal(external.source_metadata.provider, "naver_api_hub");
  assert.equal(external.source_origin_kind, "external_web");
  assert.equal(external.source_origin_host, "sample.tistory.com");
});

test("15.9E resolves explicit origin first and infers legacy origin without persistence", () => {
  assert.deepEqual(resolveSignalSourceOrigin({
    source_origin_kind: "external_web",
    source_origin_host: "www.example.com",
    source_origin_classifier_version: "source-origin-v0.1",
    canonical_url: "https://example.com/a",
  }), {
    kind: "external_web",
    host: "example.com",
    classifier_version: "source-origin-v0.1",
    resolution: "explicit",
  });

  assert.deepEqual(resolveSignalSourceOrigin({
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/legacy/224333944655",
  }), {
    kind: "naver_blog",
    host: "blog.naver.com",
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
    resolution: "inferred_legacy",
  });
});

test("15.9E full-context dispatch rejects unsupported origin before any network request", async () => {
  let fetched = false;
  const result = await fetchSourceFullContext({
    source_platform: "naver_blog",
    source_origin_kind: "external_web",
    source_origin_host: "sample.tistory.com",
    source_origin_classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
    canonical_url: "https://sample.tistory.com/42",
  }, {
    fetchImpl: async () => {
      fetched = true;
      throw new Error("must not fetch external origin through Naver parser");
    },
  });

  assert.equal(fetched, false);
  assert.equal(result.status, "unavailable");
  assert.equal(result.error_code, "full_context_origin_unsupported");
  assert.equal(result.source_origin_kind, "external_web");
  assert.equal(result.dispatch_version, SOURCE_FULL_CONTEXT_DISPATCH_VERSION);
});

test("15.9E preserves Naver full-context v0.2 body behavior for legacy rows", async () => {
  assert.equal(SOURCE_FULL_CONTEXT_FETCH_VERSION, "source-full-context-fetch-v0.2");
  const signal = {
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/224333944655",
  };
  const result = await fetchSourceFullContext(signal, {
    fetchImpl: async () => new Response(`
      <meta property="og:title" content="해지 지연 후기">
      <div class="se-main-container"><p>해지를 요청했지만 처리가 지연되어 여러 번 문의했습니다.</p></div>
      <div id="ad-bottom-portal"></div>
    `, { status: 200 }),
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.version, "source-full-context-fetch-v0.2");
  assert.equal(result.source_origin_kind, "naver_blog");
  assert.equal(result.source_origin_resolution, "inferred_legacy");
  assert.match(result.content_text, /처리가 지연/);
});

test("15.9E migration is additive, nullable and contains zero historical backfill", async () => {
  const migration = await read("supabase/migrations/038_source_origin_contract.sql");
  assert.match(migration, /source_origin_kind text/);
  assert.match(migration, /source_origin_host text/);
  assert.match(migration, /source_origin_classifier_version text/);
  assert.match(migration, /naver_blog.*external_web.*threads/s);
  assert.match(migration, /ar_source_signals_origin_idx/);
  assert.doesNotMatch(migration, /update\s+(?:public\.)?ar_source_signals/i);
  assert.doesNotMatch(migration, /source_platform\s*=|drop\s+constraint[^;]*source_platform/i);
  assert.doesNotMatch(migration, /ar_source_incidents|ar_source_incident_links|ar_public_problems|ar_public_problem_evidence_snapshots|ar_public_problem_feed/);
});

test("15.9E verification remains read-only and blind-safe", async () => {
  const script = await read("scripts/run-source-origin-contract-verification-15-9e.mjs");
  assert.match(script, /getEvaluationSampleIds/);
  assert.match(script, /blind_overlap/);
  assert.match(script, /classifySourceOrigin/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /EXPECTED_NAVER_BLOG = 5/);
  assert.match(script, /EXPECTED_EXTERNAL_WEB = 308/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.from\([^)]*\)[\s\S]{0,500}?\.update\(/);
  assert.doesNotMatch(script, /ar_source_signal_human_evaluations/);
  assert.doesNotMatch(script, /ar_register_source_incident|ar_set_public_problem_status/);
});
