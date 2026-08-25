import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildNaverBlogSearchUrl,
  NAVER_BLOG_ADAPTER_VERSION,
  NaverBlogAdapterError,
  normalizeNaverBlogItem,
  normalizeNaverBlogSearchInput,
  normalizeNaverSearchText,
  searchNaverBlogPosts,
} from "../lib/sources/naver-blog-adapter.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Naver blog input maps provider sort into the generic Source Run contract", () => {
  assert.deepEqual(normalizeNaverBlogSearchInput({ q: " 배달 불편 ", sort: "date", limit: 20, start: 51 }), {
    q: "배달 불편",
    sort: "date",
    start: 51,
    limit: 20,
    search_type: "RECENT",
    search_mode: "KEYWORD",
    since: null,
    until: null,
    request_metadata: {
      provider: "naver_api_hub",
      resource: "blog_search",
      sort: "date",
      start: 51,
      display: 20,
    },
  });
  assert.equal(normalizeNaverBlogSearchInput({ q: "예약", sort: "sim" }).search_type, "TOP");
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "" }), /q must contain/);
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "x", limit: 51 }), /between 1 and 50/);
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "x", start: 1000, limit: 2 }), /position 1000/);
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "x", sort: "random" }), /date or sim/);
});

test("NAVER API HUB blog URL contains provider search dimensions but never credentials", () => {
  const url = buildNaverBlogSearchUrl({ q: "헬스장 환불", sort: "sim", limit: 30, start: 101 });
  assert.equal(url.origin, "https://naverapihub.apigw.ntruss.com");
  assert.equal(url.pathname, "/search/v1/blog");
  assert.equal(url.searchParams.get("query"), "헬스장 환불");
  assert.equal(url.searchParams.get("display"), "30");
  assert.equal(url.searchParams.get("start"), "101");
  assert.equal(url.searchParams.get("sort"), "sim");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.has("client_id"), false);
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("Naver search markup is normalized without pretending a snippet is full content", () => {
  assert.equal(normalizeNaverSearchText("<b>배달</b> &amp; 예약이 너무 불편"), "배달 & 예약이 너무 불편");

  const item = {
    title: "<b>배달</b> 앱 최소주문",
    link: "https://blog.naver.com/sample/223123456789",
    description: "최소 주문 금액 때문에 <b>필요 없는 메뉴</b>까지 시켰습니다.",
    bloggername: "불편 기록장",
    bloggerlink: "https://blog.naver.com/sample",
    postdate: "20260820",
  };
  const left = normalizeNaverBlogItem(item);
  const right = normalizeNaverBlogItem(item);

  assert.equal(left.source_platform, "naver_blog");
  assert.equal(left.raw_text, "배달 앱 최소주문\n\n최소 주문 금액 때문에 필요 없는 메뉴까지 시켰습니다.");
  assert.equal(left.media_type, "BLOG_SEARCH_SNIPPET");
  assert.equal(left.content_scope, "search_snippet");
  assert.equal(left.acquisition_method, "official_api");
  assert.equal(left.adapter_version, NAVER_BLOG_ADAPTER_VERSION);
  assert.equal(left.source_metadata.provider, "naver_api_hub");
  assert.equal(left.external_content_id, right.external_content_id);
  assert.match(left.external_content_id, /^[0-9a-f]{64}$/);
  assert.match(left.content_hash, /^[0-9a-f]{64}$/);
  assert.equal(left.source_metadata.provider_title, item.title);
  assert.equal(left.source_metadata.provider_description, item.description);
  assert.equal(left.published_at, "2026-08-19T15:00:00.000Z");
});

test("NAVER API HUB adapter keeps credentials in current APIGW headers", async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          total: 2,
          start: 1,
          display: 2,
          lastBuildDate: "Thu, 20 Aug 2026 10:00:00 +0900",
          items: [
            {
              title: "예약이 불편",
              link: "https://blog.naver.com/a/1",
              description: "앱에서 예약 변경이 안 됐습니다.",
              bloggername: "사용자 A",
              bloggerlink: "https://blog.naver.com/a",
              postdate: "20260820",
            },
            { title: "텍스트는 있지만 링크 없음", description: "skip" },
          ],
        };
      },
    };
  };

  const result = await searchNaverBlogPosts(
    { q: "예약 불편", limit: 2 },
    { clientId: "client-id", clientSecret: "client-secret", fetchImpl },
  );

  assert.equal(capturedOptions.headers["X-NCP-APIGW-API-KEY-ID"], "client-id");
  assert.equal(capturedOptions.headers["X-NCP-APIGW-API-KEY"], "client-secret");
  assert.equal(capturedOptions.headers["X-Naver-Client-Id"], undefined);
  assert.equal(capturedOptions.headers["X-Naver-Client-Secret"], undefined);
  assert.equal(capturedUrl.origin, "https://naverapihub.apigw.ntruss.com");
  assert.equal(capturedUrl.searchParams.has("client-id"), false);
  assert.equal(capturedUrl.searchParams.has("client-secret"), false);
  assert.equal(result.fetched_count, 2);
  assert.equal(result.signals.length, 1);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.paging.total, 2);
});

test("missing Naver credentials fail closed before network access", async () => {
  await assert.rejects(
    () => searchNaverBlogPosts(
      { q: "불편" },
      { clientId: "", clientSecret: "", fetchImpl: async () => assert.fail("must not fetch") },
    ),
    (error) => error instanceof NaverBlogAdapterError
      && error.code === "naver_blog_not_configured"
      && error.status === 503,
  );
});

test("legacy NAVER Developers Center endpoint and auth headers cannot return", async () => {
  const adapter = await read("lib/sources/naver-blog-adapter.mjs");
  assert.doesNotMatch(adapter, /openapi\.naver\.com/);
  assert.doesNotMatch(adapter, /X-Naver-Client-Id/);
  assert.doesNotMatch(adapter, /X-Naver-Client-Secret/);
  assert.match(adapter, /naverapihub\.apigw\.ntruss\.com/);
  assert.match(adapter, /X-NCP-APIGW-API-KEY-ID/);
  assert.match(adapter, /X-NCP-APIGW-API-KEY/);
});

test("Phase 15.5B migration preserves source boundaries while adding explicit provenance", async () => {
  const migration = await read("supabase/migrations/025_multi_source_signal_acquisition.sql");
  assert.match(migration, /source_platform in \('threads', 'naver_blog'\)/);
  assert.match(migration, /request_metadata jsonb/);
  assert.match(migration, /acquisition_method text/);
  assert.match(migration, /content_scope text/);
  assert.match(migration, /source_metadata jsonb/);
  assert.match(migration, /search_snippet/);
  assert.doesNotMatch(migration, /ar_raw_inputs|ar_pain_evidences|ar_public_problems/);
});

test("generic persistence dedupes by platform plus external identity, not Threads alone", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /sourceSignalKey/);
  assert.match(service, /source_platform/);
  assert.match(service, /external_content_id/);
  assert.doesNotMatch(service, /\.eq\("source_platform", "threads"\)/);
  assert.match(service, /onConflict: "source_platform,external_content_id"/);
});

test("Naver ingestion route is curator-only and persists only prefiltered Source Signal supply data", async () => {
  const route = await read("app/api/radar/admin/sources/naver/blog/search/route.js");
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /normalizeNaverBlogSearchInput/);
  assert.match(route, /sourcePlatform: "naver_blog"/);
  assert.ok(route.indexOf("createSourceIngestionRun") < route.indexOf("searchNaverBlogPosts(input)"));
  assert.match(route, /persistDiscoveredSourceSignals/);
  assert.match(route, /failSourceIngestionRun/);
  assert.doesNotMatch(route, /ar_raw_inputs|ar_pain_evidences|ar_public_problems/);
});

test("Source Lab exposes multi-source provenance", async () => {
  const [page, naverForm, review, env] = await Promise.all([
    read("app/curator/sources/page.js"),
    read("app/components/naver-blog-source-search-form.js"),
    read("app/components/source-signal-complaint-review.js"),
    read(".env.local.example"),
  ]);
  assert.match(page, /NaverBlogSourceSearchForm/);
  assert.match(page, /ThreadsSourceSearchForm/);
  assert.match(page, /source_platform/);
  assert.match(naverForm, /content_scope=search_snippet/);
  assert.match(review, /search_snippet/);
  assert.match(env, /NAVER_CLIENT_ID/);
  assert.match(env, /NAVER_CLIENT_SECRET/);
});
