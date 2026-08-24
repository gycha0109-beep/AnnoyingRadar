import { createHash } from "node:crypto";

export const SOURCE_FULL_CONTEXT_FETCH_VERSION = "source-full-context-fetch-v0.1";
export const SOURCE_FULL_CONTEXT_FETCH_TIMEOUT_MS = 15_000;
export const SOURCE_FULL_CONTEXT_MAX_CHARS = 60_000;

const NAVER_BLOG_HOSTS = new Set(["blog.naver.com", "m.blog.naver.com"]);
const BLOG_ID_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;
const LOG_NO_PATTERN = /^\d{8,24}$/;

export function parseNaverBlogCanonicalUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!NAVER_BLOG_HOSTS.has(hostname)) return null;

  let blogId = null;
  let logNo = null;
  if (/\/PostView\.naver$/i.test(url.pathname)) {
    blogId = url.searchParams.get("blogId");
    logNo = url.searchParams.get("logNo");
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      [blogId, logNo] = parts;
    }
  }

  blogId = String(blogId ?? "").trim();
  logNo = String(logNo ?? "").trim();
  if (!BLOG_ID_PATTERN.test(blogId) || !LOG_NO_PATTERN.test(logNo)) return null;
  return { blog_id: blogId, log_no: logNo };
}

export function buildNaverBlogPostViewUrl(canonicalUrl) {
  const parsed = parseNaverBlogCanonicalUrl(canonicalUrl);
  if (!parsed) return null;
  const url = new URL("https://m.blog.naver.com/PostView.naver");
  url.searchParams.set("blogId", parsed.blog_id);
  url.searchParams.set("logNo", parsed.log_no);
  return url.toString();
}

export function extractNaverBlogFullContextHtml(html) {
  const source = String(html ?? "");
  if (!source.trim()) return null;

  const title = extractMetaContent(source, "og:title") || extractHtmlTitle(source) || null;
  const bodyHtml = findNaverPostBody(source);
  if (!bodyHtml) return null;
  const contentText = htmlToReadableText(bodyHtml);
  if (contentText.length < 20) return null;

  return {
    title,
    content_text: contentText,
    content_hash: createHash("sha256").update(contentText).digest("hex"),
  };
}

export async function fetchSourceFullContext(signal, {
  fetchImpl = globalThis.fetch,
  timeoutMs = SOURCE_FULL_CONTEXT_FETCH_TIMEOUT_MS,
  maxChars = SOURCE_FULL_CONTEXT_MAX_CHARS,
} = {}) {
  const canonicalUrl = String(signal?.canonical_url ?? "").trim() || null;
  if (signal?.source_platform !== "naver_blog") {
    return unavailable({ canonicalUrl, code: "full_context_source_unsupported" });
  }

  const fetchUrl = buildNaverBlogPostViewUrl(canonicalUrl);
  if (!fetchUrl) {
    return unavailable({ canonicalUrl, code: "full_context_url_invalid" });
  }
  if (typeof fetchImpl !== "function") {
    return unavailable({ canonicalUrl, fetchUrl, code: "full_context_fetch_unavailable" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(fetchUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; AnnoyingRadar/0.1; +public-source-context-resolution)",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    return unavailable({
      canonicalUrl,
      fetchUrl,
      code: error?.name === "AbortError" ? "full_context_fetch_timeout" : "full_context_fetch_failed",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response?.ok) {
    return unavailable({
      canonicalUrl,
      fetchUrl,
      code: "full_context_fetch_http_error",
      httpStatus: Number(response?.status) || null,
    });
  }

  let html;
  try {
    html = await response.text();
  } catch {
    return unavailable({ canonicalUrl, fetchUrl, code: "full_context_body_read_failed" });
  }

  const parsed = extractNaverBlogFullContextHtml(html);
  if (!parsed) {
    return unavailable({ canonicalUrl, fetchUrl, code: "full_context_body_not_found" });
  }

  const fullText = parsed.content_text;
  const truncated = fullText.length > maxChars;
  return {
    version: SOURCE_FULL_CONTEXT_FETCH_VERSION,
    status: "resolved",
    source_platform: signal.source_platform,
    canonical_url: canonicalUrl,
    fetched_url: fetchUrl,
    title: parsed.title,
    content_text: truncated ? fullText.slice(0, maxChars) : fullText,
    content_hash: parsed.content_hash,
    original_char_count: fullText.length,
    truncated,
    content_scope: "full_post",
    error_code: null,
    http_status: Number(response.status) || 200,
  };
}

function unavailable({ canonicalUrl, fetchUrl = null, code, httpStatus = null }) {
  return {
    version: SOURCE_FULL_CONTEXT_FETCH_VERSION,
    status: "unavailable",
    canonical_url: canonicalUrl,
    fetched_url: fetchUrl,
    content_text: null,
    content_hash: null,
    original_char_count: null,
    truncated: false,
    content_scope: null,
    error_code: code,
    http_status: httpStatus,
  };
}

function findNaverPostBody(html) {
  const startPatterns = [
    /<[^>]+class=["'][^"']*\bse-main-container\b[^"']*["'][^>]*>/i,
    /<[^>]+id=["']postViewArea["'][^>]*>/i,
    /<[^>]+class=["'][^"']*\bse3_view\b[^"']*["'][^>]*>/i,
  ];
  let start = -1;
  for (const pattern of startPatterns) {
    const match = pattern.exec(html);
    if (match) {
      start = match.index + match[0].length;
      break;
    }
  }
  if (start < 0) return null;

  const tail = html.slice(start);
  const endPatterns = [
    /<[^>]+id=["']ad-bottom-portal["'][^>]*>/i,
    /<[^>]+class=["'][^"']*\bpost_footer\b[^"']*["'][^>]*>/i,
    /<[^>]+class=["'][^"']*\bpost-btn\b[^"']*["'][^>]*>/i,
  ];
  let end = tail.length;
  for (const pattern of endPatterns) {
    const match = pattern.exec(tail);
    if (match && match.index < end) end = match.index;
  }
  return tail.slice(0, end);
}

function htmlToReadableText(value) {
  return decodeHtmlEntities(String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/section)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMetaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i").exec(html);
  if (forward) return decodeHtmlEntities(forward[1]).trim() || null;
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, "i").exec(html);
  return reverse ? decodeHtmlEntities(reverse[1]).trim() || null : null;
}

function extractHtmlTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToReadableText(match[1]) || null : null;
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}
