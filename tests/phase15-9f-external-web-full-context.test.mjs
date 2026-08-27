import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION,
  extractExternalWebArticleHtml,
  fetchExternalWebFullContext,
  isPublicInternetAddress,
  resolvePublicHost,
  validateExternalWebPublicUrl,
} from "../lib/sources/external-web-full-context-fetch.mjs";
import {
  fetchSourceFullContext,
  SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
  SOURCE_FULL_CONTEXT_FETCH_VERSION,
} from "../lib/sources/source-full-context-fetch.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const articleBody = `
  <article>
    <header>사이트 공통 머리말</header>
    <h1>번호이동 제한 해제 후기</h1>
    <p>번호이동을 신청했지만 제한 서비스가 걸려 있어 바로 처리되지 않았습니다.</p>
    <p>고객센터와 통신사에 여러 번 문의한 뒤 제한을 해제하고 다시 번호이동을 신청해야 했습니다.</p>
    <p>처리 과정과 필요한 절차가 처음부터 명확하게 안내되지 않아 시간이 더 들었고, 같은 설명을 반복해야 했습니다.</p>
    <footer>공통 푸터와 광고</footer>
  </article>
`;

test("15.9F public URL guard rejects local/private/reserved targets and non-default ports", () => {
  for (const value of [
    "http://localhost/a",
    "http://127.0.0.1/a",
    "http://10.0.0.1/a",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.0.1/a",
    "https://example.com:8443/a",
    "ftp://example.com/a",
    "https://user:pass@example.com/a",
  ]) {
    assert.equal(validateExternalWebPublicUrl(value).ok, false, value);
  }
  assert.equal(validateExternalWebPublicUrl("https://www.example.com/post/1").ok, true);
  assert.equal(validateExternalWebPublicUrl("https://www.example.com/post/1").host, "example.com");
});

test("15.9F internet address guard admits public IPv4/IPv6 and rejects private/documentation ranges", () => {
  assert.equal(isPublicInternetAddress("93.184.216.34"), true);
  assert.equal(isPublicInternetAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicInternetAddress("127.0.0.1"), false);
  assert.equal(isPublicInternetAddress("100.64.0.1"), false);
  assert.equal(isPublicInternetAddress("198.51.100.1"), false);
  assert.equal(isPublicInternetAddress("203.0.113.10"), false);
  assert.equal(isPublicInternetAddress("::1"), false);
  assert.equal(isPublicInternetAddress("fc00::1"), false);
  assert.equal(isPublicInternetAddress("fe80::1"), false);
  assert.equal(isPublicInternetAddress("2001:db8::1"), false);
});

test("15.9F DNS preflight fails closed if any resolved address is non-public", async () => {
  const mixed = await resolvePublicHost("example.com", {
    lookupImpl: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ],
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.addresses.length, 2);
});

test("15.9F high-confidence extractor selects article text and strips page chrome", () => {
  const parsed = extractExternalWebArticleHtml(`
    <html>
      <head><meta property="og:title" content="통신 해지 후기"></head>
      <body>
        <nav>메뉴 메뉴 메뉴</nav>
        ${articleBody}
        <aside>추천글</aside>
      </body>
    </html>
  `);
  assert.ok(parsed);
  assert.equal(parsed.title, "통신 해지 후기");
  assert.equal(parsed.extraction_scope, "article_element");
  assert.match(parsed.content_text, /여러 번 문의/);
  assert.doesNotMatch(parsed.content_text, /사이트 공통 머리말|공통 푸터와 광고|추천글/);
  assert.match(parsed.content_hash, /^[0-9a-f]{64}$/);
});

test("15.9F generic extractor refuses low-confidence body-only pages", () => {
  const parsed = extractExternalWebArticleHtml(`
    <html><body><div>${"본문처럼 보이는 일반 div 텍스트 ".repeat(30)}</div></body></html>
  `);
  assert.equal(parsed, null);
});

test("15.9F external fetch allows same-origin redirect and returns bounded full-post text", async () => {
  const calls = [];
  const result = await fetchExternalWebFullContext("http://www.example.com/post/1", {
    lookupImpl: publicLookup,
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return new Response(null, {
          status: 301,
          headers: { location: "https://example.com/post/1" },
        });
      }
      return new Response(`<html><head><title>후기</title></head><body>${articleBody}</body></html>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.version, EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION);
  assert.equal(result.redirect_count, 1);
  assert.equal(result.extraction_scope, "article_element");
  assert.equal(result.content_scope, "full_post");
  assert.match(result.content_text, /번호이동/);
  assert.equal(calls.length, 2);
});

test("15.9F external fetch rejects cross-host redirects before following them", async () => {
  let calls = 0;
  const result = await fetchExternalWebFullContext("https://example.com/post/1", {
    lookupImpl: publicLookup,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "https://other.example.net/post/1" },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "unavailable");
  assert.equal(result.error_code, "full_context_external_redirect_unsafe");
});

test("15.9F external fetch enforces HTML content type and response-size cap", async () => {
  const unsupported = await fetchExternalWebFullContext("https://example.com/post/1", {
    lookupImpl: publicLookup,
    fetchImpl: async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  assert.equal(unsupported.error_code, "full_context_external_content_type_unsupported");

  const oversized = await fetchExternalWebFullContext("https://example.com/post/1", {
    lookupImpl: publicLookup,
    maxBytes: 128,
    fetchImpl: async () => new Response(articleBody.repeat(10), {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(oversized.error_code, "full_context_external_body_too_large");
});

test("15.9F external dispatch is explicitly opt-in and leaves legacy default fail-closed", async () => {
  const signal = {
    source_platform: "naver_blog",
    canonical_url: "https://example.com/post/1",
  };
  let fetchCalls = 0;
  const blocked = await fetchSourceFullContext(signal, {
    lookupImpl: publicLookup,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(`<html><body>${articleBody}</body></html>`);
    },
  });
  assert.equal(blocked.error_code, "full_context_origin_unsupported");
  assert.equal(fetchCalls, 0);

  const enabled = await fetchSourceFullContext(signal, {
    externalWebPolicy: SOURCE_FULL_CONTEXT_EXTERNAL_POLICY,
    lookupImpl: publicLookup,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(`<html><body>${articleBody}</body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(enabled.status, "resolved");
  assert.equal(enabled.source_origin_kind, "external_web");
  assert.equal(enabled.version, EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION);
  assert.equal(fetchCalls, 1);
});

test("15.9F keeps Naver body acquisition version stable", () => {
  assert.equal(SOURCE_FULL_CONTEXT_FETCH_VERSION, "source-full-context-fetch-v0.2");
});

test("15.9F implementation has no governed DB mutation path", async () => {
  const [externalFetcher, dispatcher] = await Promise.all([
    read("lib/sources/external-web-full-context-fetch.mjs"),
    read("lib/sources/source-full-context-fetch.mjs"),
  ]);
  for (const source of [externalFetcher, dispatcher]) {
    assert.doesNotMatch(source, /ar_source_incidents|ar_public_problems|ar_public_problem_evidence_snapshots|ar_public_problem_feed/);
    assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.delete\(|\.update\(/);
  }
});
