import { createHash } from "node:crypto";

export const THREADS_ADAPTER_VERSION = "threads-keyword-v1";
export const THREADS_API_HOST = "https://graph.threads.net";
export const THREADS_SEARCH_FIELDS = [
  "id",
  "media_type",
  "permalink",
  "username",
  "text",
  "timestamp",
  "shortcode",
  "is_quote_post",
  "has_replies",
].join(",");

const SEARCH_TYPES = new Set(["TOP", "RECENT"]);
const SEARCH_MODES = new Set(["KEYWORD", "TAG"]);

export class ThreadsAdapterError extends Error {
  constructor(message, { code = "threads_api_error", status = 502, cause = null, upstream = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ThreadsAdapterError";
    this.code = code;
    this.status = status;
    this.upstream = upstream;
  }
}

function optionalDateTime(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${label} must be a valid date-time string or null`);
  }
  return new Date(value).toISOString();
}

export function normalizeThreadsSearchInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Threads search body must be an object");
  }

  const q = typeof value.q === "string" ? value.q.trim() : "";
  if (q.length < 1 || q.length > 120) {
    throw new RangeError("q must contain 1 to 120 characters");
  }

  const searchType = String(value.search_type ?? "RECENT").toUpperCase();
  if (!SEARCH_TYPES.has(searchType)) throw new TypeError("search_type must be TOP or RECENT");

  const searchMode = String(value.search_mode ?? "KEYWORD").toUpperCase();
  if (!SEARCH_MODES.has(searchMode)) throw new TypeError("search_mode must be KEYWORD or TAG");

  const rawLimit = value.limit ?? 25;
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("limit must be an integer between 1 and 50");
  }

  const since = optionalDateTime(value.since, "since");
  const until = optionalDateTime(value.until, "until");
  if (since && until && new Date(since) >= new Date(until)) {
    throw new RangeError("since must be earlier than until");
  }

  return { q, search_type: searchType, search_mode: searchMode, limit, since, until };
}

export function buildThreadsKeywordSearchUrl(input, host = THREADS_API_HOST) {
  const normalized = normalizeThreadsSearchInput(input);
  const url = new URL("/keyword_search", host);
  url.searchParams.set("q", normalized.q);
  url.searchParams.set("search_type", normalized.search_type);
  url.searchParams.set("search_mode", normalized.search_mode);
  url.searchParams.set("limit", String(normalized.limit));
  url.searchParams.set("fields", THREADS_SEARCH_FIELDS);
  if (normalized.since) url.searchParams.set("since", normalized.since);
  if (normalized.until) url.searchParams.set("until", normalized.until);
  return url;
}

export function normalizeThreadsPost(post) {
  if (!post || typeof post !== "object" || Array.isArray(post)) return null;
  const externalId = typeof post.id === "string" ? post.id.trim() : "";
  const rawText = typeof post.text === "string" ? post.text.trim() : "";
  if (!externalId || !rawText) return null;

  const publishedAt = typeof post.timestamp === "string" && !Number.isNaN(Date.parse(post.timestamp))
    ? new Date(post.timestamp).toISOString()
    : null;
  const canonicalUrl = typeof post.permalink === "string" && post.permalink.trim()
    ? post.permalink.trim()
    : null;
  const authorHandle = typeof post.username === "string" && post.username.trim()
    ? post.username.trim()
    : null;
  const mediaType = typeof post.media_type === "string" && post.media_type.trim()
    ? post.media_type.trim()
    : null;

  return {
    source_platform: "threads",
    external_content_id: externalId,
    canonical_url: canonicalUrl,
    author_handle: authorHandle,
    raw_text: rawText,
    media_type: mediaType,
    published_at: publishedAt,
    content_hash: createHash("sha256").update(rawText).digest("hex"),
    adapter_version: THREADS_ADAPTER_VERSION,
    is_quote_post: typeof post.is_quote_post === "boolean" ? post.is_quote_post : null,
  };
}

export async function searchThreadsPosts(input, {
  accessToken = process.env.THREADS_ACCESS_TOKEN,
  fetchImpl = fetch,
  host = process.env.THREADS_API_HOST || THREADS_API_HOST,
} = {}) {
  const normalized = normalizeThreadsSearchInput(input);
  if (!accessToken) {
    throw new ThreadsAdapterError("THREADS_ACCESS_TOKEN is not configured", {
      code: "threads_not_configured",
      status: 503,
    });
  }

  const url = buildThreadsKeywordSearchUrl(normalized, host);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new ThreadsAdapterError("Threads API request failed", {
      code: "threads_network_error",
      status: 502,
      cause: error,
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Preserve a stable adapter error instead of leaking an upstream HTML/body response.
  }

  if (!response.ok) {
    const upstreamError = payload?.error ?? null;
    const upstreamMessage = upstreamError?.message;
    const upstreamCode = upstreamError?.code;
    throw new ThreadsAdapterError(
      upstreamMessage ? `Threads API: ${upstreamMessage}` : `Threads API returned HTTP ${response.status}`,
      {
        code: upstreamCode ? `threads_upstream_${upstreamCode}` : "threads_upstream_error",
        status: response.status === 401 || response.status === 403 ? 502 : Math.max(502, response.status),
        upstream: upstreamError ? {
          http_status: response.status,
          type: upstreamError.type ?? null,
          code: upstreamError.code ?? null,
          error_subcode: upstreamError.error_subcode ?? null,
          fbtrace_id: upstreamError.fbtrace_id ?? null,
          is_transient: upstreamError.is_transient ?? null,
          error_user_title: upstreamError.error_user_title ?? null,
          error_user_msg: upstreamError.error_user_msg ?? null,
        } : { http_status: response.status },
      },
    );
  }

  const rawPosts = Array.isArray(payload?.data) ? payload.data : [];
  const signals = rawPosts.map(normalizeThreadsPost).filter(Boolean);
  return {
    input: normalized,
    fetched_count: rawPosts.length,
    skipped_count: rawPosts.length - signals.length,
    signals,
    paging: payload?.paging ?? null,
  };
}
