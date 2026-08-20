import { createHash } from "node:crypto";

export const NAVER_BLOG_ADAPTER_VERSION = "naver-blog-search-v1";
export const NAVER_BLOG_SEARCH_URL = "https://openapi.naver.com/v1/search/blog.json";

export class NaverBlogAdapterError extends Error {
  constructor(message, { code = "naver_blog_api_error", status = 502, cause = null, upstream = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "NaverBlogAdapterError";
    this.code = code;
    this.status = status;
    this.upstream = upstream;
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function normalizeNaverSearchText(value) {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostDate(value) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const parsed = new Date(`${year}-${month}-${day}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeNaverBlogSearchInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Naver blog search body must be an object");
  }

  const q = typeof value.q === "string" ? value.q.trim() : "";
  if (q.length < 1 || q.length > 120) {
    throw new RangeError("q must contain 1 to 120 characters");
  }

  const sort = String(value.sort ?? "date").toLowerCase();
  if (sort !== "date" && sort !== "sim") {
    throw new TypeError("sort must be date or sim");
  }

  const limit = Number(value.limit ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("limit must be an integer between 1 and 50");
  }

  const start = Number(value.start ?? 1);
  if (!Number.isInteger(start) || start < 1 || start > 1000) {
    throw new RangeError("start must be an integer between 1 and 1000");
  }
  if (start + limit - 1 > 1000) {
    throw new RangeError("start + limit must not exceed Naver search position 1000");
  }

  return {
    q,
    sort,
    start,
    limit,
    search_type: sort === "date" ? "RECENT" : "TOP",
    search_mode: "KEYWORD",
    since: null,
    until: null,
    request_metadata: {
      provider: "naver",
      resource: "blog_search",
      sort,
      start,
      display: limit,
    },
  };
}

export function buildNaverBlogSearchUrl(value) {
  const input = normalizeNaverBlogSearchInput(value);
  const url = new URL(NAVER_BLOG_SEARCH_URL);
  url.searchParams.set("query", input.q);
  url.searchParams.set("display", String(input.limit));
  url.searchParams.set("start", String(input.start));
  url.searchParams.set("sort", input.sort);
  return url;
}

export function normalizeNaverBlogItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const canonicalUrl = typeof item.link === "string" ? item.link.trim() : "";
  if (!canonicalUrl) return null;
  try {
    new URL(canonicalUrl);
  } catch {
    return null;
  }

  const title = normalizeNaverSearchText(item.title);
  const description = normalizeNaverSearchText(item.description);
  const rawText = [title, description].filter(Boolean).join("\n\n").trim();
  if (!rawText) return null;

  const bloggerName = normalizeNaverSearchText(item.bloggername) || null;
  const bloggerLink = typeof item.bloggerlink === "string" && item.bloggerlink.trim()
    ? item.bloggerlink.trim()
    : null;

  return {
    source_platform: "naver_blog",
    external_content_id: createHash("sha256").update(canonicalUrl).digest("hex"),
    canonical_url: canonicalUrl,
    author_handle: bloggerName,
    raw_text: rawText,
    media_type: "BLOG_SEARCH_SNIPPET",
    published_at: normalizePostDate(item.postdate),
    content_hash: createHash("sha256").update(rawText).digest("hex"),
    adapter_version: NAVER_BLOG_ADAPTER_VERSION,
    is_quote_post: null,
    acquisition_method: "official_api",
    content_scope: "search_snippet",
    source_metadata: {
      provider: "naver",
      resource: "blog_search",
      provider_title: typeof item.title === "string" ? item.title : null,
      provider_description: typeof item.description === "string" ? item.description : null,
      blogger_link: bloggerLink,
      postdate: typeof item.postdate === "string" ? item.postdate : null,
    },
  };
}

export async function searchNaverBlogPosts(value, {
  clientId = process.env.NAVER_CLIENT_ID,
  clientSecret = process.env.NAVER_CLIENT_SECRET,
  fetchImpl = fetch,
} = {}) {
  const input = normalizeNaverBlogSearchInput(value);
  if (!clientId || !clientSecret) {
    throw new NaverBlogAdapterError("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are not configured", {
      code: "naver_blog_not_configured",
      status: 503,
    });
  }

  const url = buildNaverBlogSearchUrl(input);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new NaverBlogAdapterError("Naver Blog Search API request failed", {
      code: "naver_blog_network_error",
      status: 502,
      cause: error,
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep a stable adapter error without leaking an upstream non-JSON response.
  }

  if (!response.ok) {
    const upstreamCode = typeof payload?.errorCode === "string" ? payload.errorCode : null;
    const upstreamMessage = typeof payload?.errorMessage === "string" ? payload.errorMessage : null;
    throw new NaverBlogAdapterError(
      upstreamMessage ? `Naver Blog Search API: ${upstreamMessage}` : `Naver Blog Search API returned HTTP ${response.status}`,
      {
        code: upstreamCode ? `naver_blog_upstream_${upstreamCode}` : "naver_blog_upstream_error",
        status: response.status === 401 || response.status === 403 ? 502 : Math.max(502, response.status),
        upstream: {
          http_status: response.status,
          error_code: upstreamCode,
          error_message: upstreamMessage,
        },
      },
    );
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const signals = items.map(normalizeNaverBlogItem).filter(Boolean);
  return {
    input,
    fetched_count: items.length,
    skipped_count: items.length - signals.length,
    signals,
    paging: {
      total: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null,
      start: Number.isFinite(Number(payload?.start)) ? Number(payload.start) : input.start,
      display: Number.isFinite(Number(payload?.display)) ? Number(payload.display) : input.limit,
      last_build_date: typeof payload?.lastBuildDate === "string" ? payload.lastBuildDate : null,
    },
  };
}
