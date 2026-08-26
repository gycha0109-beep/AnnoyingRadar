import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNaverBlogPostViewUrl,
  extractNaverBlogFullContextHtml,
  fetchSourceFullContext,
  parseNaverBlogCanonicalUrl,
  SOURCE_FULL_CONTEXT_FETCH_VERSION,
} from "../lib/sources/source-full-context-fetch.mjs";

test("Phase 15.5F full-context fetch contract is versioned and parses canonical Naver URLs", () => {
  assert.equal(SOURCE_FULL_CONTEXT_FETCH_VERSION, "source-full-context-fetch-v0.2");
  assert.deepEqual(
    parseNaverBlogCanonicalUrl("https://blog.naver.com/chaochao123-/224383955775"),
    { blog_id: "chaochao123-", log_no: "224383955775" },
  );
  assert.deepEqual(
    parseNaverBlogCanonicalUrl("https://m.blog.naver.com/PostView.naver?blogId=tpoyns&logNo=224383414011"),
    { blog_id: "tpoyns", log_no: "224383414011" },
  );
  assert.equal(parseNaverBlogCanonicalUrl("https://example.com/a/224383414011"), null);
  assert.equal(
    buildNaverBlogPostViewUrl("https://blog.naver.com/tpoyns/224383414011"),
    "https://m.blog.naver.com/PostView.naver?blogId=tpoyns&logNo=224383414011",
  );
});

test("Naver full-context parser extracts the balanced visible post body and excludes trailing platform metadata", () => {
  const parsed = extractNaverBlogFullContextHtml(`
    <html><head><meta property="og:title" content="환불 &amp; 지연 후기"></head><body>
      <div class="se-main-container">
        <div class="se-component"><p>환불 요청 뒤에도 연락이 오지 않았습니다.</p></div>
        <script>window.bad = "<div>not a real nesting boundary</div>";</script>
        <div class="se-component"><div><p>며칠 동안 다시 전화해야 했습니다.</p></div></div>
      </div>
      {"smartEditorVersion":4,"blogDisplay":true,"meDisplay":true,"outsideDisplay":true,"lineDisplay":true,"cafeDisplay":true}
      <div id="ad-bottom-portal">광고 문구</div>
      <div class="post_footer">푸터 문구</div>
    </body></html>
  `);
  assert.ok(parsed);
  assert.equal(parsed.title, "환불 & 지연 후기");
  assert.match(parsed.content_text, /환불 요청 뒤에도 연락이 오지 않았습니다/);
  assert.match(parsed.content_text, /며칠 동안 다시 전화해야 했습니다/);
  assert.doesNotMatch(parsed.content_text, /window\.bad|smartEditorVersion|blogDisplay|광고 문구|푸터 문구/);
  assert.match(parsed.content_hash, /^[0-9a-f]{64}$/);
});

test("Naver trailing metadata key order cannot change canonical full-context text or hash", () => {
  const body = `
    <div class="se-main-container">
      <div class="se-component"><p>예약 완료 안내를 받았지만 숙소에는 예약이 잡혀 있지 않았습니다.</p></div>
      <div class="se-component"><p>현장에서 다른 숙소를 다시 찾아야 했습니다.</p></div>
    </div>
  `;
  const first = extractNaverBlogFullContextHtml(`
    <meta property="og:title" content="예약 누락 후기">
    ${body}
    {"smartEditorVersion":4,"meDisplay":true,"lineDisplay":true,"outsideDisplay":true,"cafeDisplay":true,"blogDisplay":true}
    <div id="ad-bottom-portal"></div>
  `);
  const second = extractNaverBlogFullContextHtml(`
    <meta property="og:title" content="예약 누락 후기">
    ${body}
    {"smartEditorVersion":4,"blogDisplay":true,"meDisplay":true,"outsideDisplay":true,"lineDisplay":true,"cafeDisplay":true}
    <div id="ad-bottom-portal"></div>
  `);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.content_text, second.content_text);
  assert.equal(first.content_hash, second.content_hash);
  assert.doesNotMatch(first.content_text, /smartEditorVersion|meDisplay|cafeDisplay/);
});

test("full-context fetch resolves public Naver post without mutating the source signal", async () => {
  const signal = {
    id: "review-1",
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/224333944655",
  };
  const original = structuredClone(signal);
  let requestedUrl = null;
  const result = await fetchSourceFullContext(signal, {
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(`
        <meta property="og:title" content="공익을 위해 남기는 환불 후기">
        <div class="se-main-container"><p>환불을 요청했지만 처리가 지연되어 여러 차례 연락했습니다.</p></div>
        {"smartEditorVersion":4,"outsideDisplay":true,"blogDisplay":true}
        <div id="ad-bottom-portal"></div>
      `, { status: 200, headers: { "content-type": "text/html" } });
    },
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.version, "source-full-context-fetch-v0.2");
  assert.equal(result.content_scope, "full_post");
  assert.match(requestedUrl, /m\.blog\.naver\.com\/PostView\.naver/);
  assert.match(result.content_text, /처리가 지연/);
  assert.doesNotMatch(result.content_text, /smartEditorVersion|outsideDisplay/);
  assert.deepEqual(signal, original);
});

test("full-context fetch failure is unavailable, never an implicit reject", async () => {
  const result = await fetchSourceFullContext({
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/224333944655",
  }, {
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.error_code, "full_context_fetch_http_error");
  assert.equal(result.http_status, 403);
  assert.equal(Object.hasOwn(result, "decision"), false);
});
