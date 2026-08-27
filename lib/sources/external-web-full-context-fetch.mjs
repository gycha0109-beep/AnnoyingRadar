import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION = "external-web-full-context-fetch-v0.1";
export const EXTERNAL_WEB_FULL_CONTEXT_MAX_BYTES = 2 * 1024 * 1024;
export const EXTERNAL_WEB_FULL_CONTEXT_MAX_REDIRECTS = 3;
export const EXTERNAL_WEB_FULL_CONTEXT_MIN_CHARS = 120;

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

export function validateExternalWebPublicUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return { ok: false, reason: "invalid_url", url: null, host: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme", url: null, host: null };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_forbidden", url: null, host: null };
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    return { ok: false, reason: "non_default_port_forbidden", url: null, host: null };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const host = hostname.replace(/^www\./, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "local_host_forbidden", url: null, host: null };
  }
  if (isIP(host) && !isPublicInternetAddress(host)) {
    return { ok: false, reason: "non_public_ip_forbidden", url: null, host: null };
  }

  return { ok: true, reason: null, url, host };
}

export function isPublicInternetAddress(value) {
  const address = String(value ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export async function resolvePublicHost(host, { lookupImpl = dnsLookup } = {}) {
  if (isIP(host)) {
    return isPublicInternetAddress(host)
      ? { ok: true, addresses: [host] }
      : { ok: false, addresses: [host] };
  }

  let records;
  try {
    records = await lookupImpl(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, addresses: [] };
  }
  const addresses = (Array.isArray(records) ? records : [records])
    .map((record) => typeof record === "string" ? record : record?.address)
    .filter(Boolean);
  if (!addresses.length || addresses.some((address) => !isPublicInternetAddress(address))) {
    return { ok: false, addresses };
  }
  return { ok: true, addresses };
}

export function extractExternalWebArticleHtml(html) {
  const source = String(html ?? "");
  if (!source.trim()) return null;

  const title = extractMetaContent(source, "og:title") || extractHtmlTitle(source) || null;
  const candidatePatterns = [
    { scope: "article_element", pattern: /<article\b[^>]*>/gi },
    { scope: "content_container", pattern: /<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:entry-content|post-content|article-content|article-body|article_body|post-view|post_view|tt_article_useless_p_margin|contents_style|blogview_content)[^"']*["'][^>]*>/gi },
    { scope: "main_element", pattern: /<main\b[^>]*>/gi },
  ];

  const candidates = [];
  for (const { scope, pattern } of candidatePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const body = extractBalancedElementContent(source, match);
      if (body === null) continue;
      const text = htmlToReadableText(stripPageChrome(body));
      if (text.length < EXTERNAL_WEB_FULL_CONTEXT_MIN_CHARS) continue;
      candidates.push({ scope, text });
      if (candidates.length >= 24) break;
    }
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) => right.text.length - left.text.length);
  const selected = candidates[0];
  return {
    title,
    content_text: selected.text,
    content_hash: createHash("sha256").update(selected.text).digest("hex"),
    extraction_scope: selected.scope,
  };
}

export async function fetchExternalWebFullContext(canonicalUrl, {
  fetchImpl = globalThis.fetch,
  lookupImpl = dnsLookup,
  timeoutMs = 15_000,
  maxBytes = EXTERNAL_WEB_FULL_CONTEXT_MAX_BYTES,
  maxChars = 60_000,
  maxRedirects = EXTERNAL_WEB_FULL_CONTEXT_MAX_REDIRECTS,
} = {}) {
  const initial = validateExternalWebPublicUrl(canonicalUrl);
  if (!initial.ok) return unavailable(canonicalUrl, "full_context_external_url_unsafe");
  if (typeof fetchImpl !== "function") return unavailable(canonicalUrl, "full_context_fetch_unavailable");

  const initialHost = initial.host;
  let currentUrl = initial.url;
  let redirectCount = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      const current = validateExternalWebPublicUrl(currentUrl);
      if (!current.ok || current.host !== initialHost) {
        return unavailable(canonicalUrl, "full_context_external_redirect_unsafe", { fetchedUrl: String(currentUrl) });
      }
      const resolved = await resolvePublicHost(current.host, { lookupImpl });
      if (!resolved.ok) {
        return unavailable(canonicalUrl, "full_context_external_dns_unsafe", { fetchedUrl: String(currentUrl) });
      }

      let response;
      try {
        response = await fetchImpl(currentUrl, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (compatible; AnnoyingRadar/0.1; +public-source-context-resolution)",
          },
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        return unavailable(canonicalUrl,
          error?.name === "AbortError" ? "full_context_fetch_timeout" : "full_context_fetch_failed",
          { fetchedUrl: String(currentUrl) });
      }

      if (isRedirectStatus(response?.status)) {
        if (redirectCount >= maxRedirects) {
          return unavailable(canonicalUrl, "full_context_external_redirect_limit", { fetchedUrl: String(currentUrl), httpStatus: response.status });
        }
        const location = response.headers?.get?.("location");
        if (!location) {
          return unavailable(canonicalUrl, "full_context_external_redirect_missing_location", { fetchedUrl: String(currentUrl), httpStatus: response.status });
        }
        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return unavailable(canonicalUrl, "full_context_external_redirect_unsafe", { fetchedUrl: String(currentUrl), httpStatus: response.status });
        }
        const next = validateExternalWebPublicUrl(nextUrl);
        if (!next.ok || next.host !== initialHost) {
          return unavailable(canonicalUrl, "full_context_external_redirect_unsafe", { fetchedUrl: String(nextUrl), httpStatus: response.status });
        }
        currentUrl = next.url;
        redirectCount += 1;
        continue;
      }

      if (!response?.ok) {
        return unavailable(canonicalUrl, "full_context_fetch_http_error", {
          fetchedUrl: String(currentUrl),
          httpStatus: Number(response?.status) || null,
        });
      }

      const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return unavailable(canonicalUrl, "full_context_external_content_type_unsupported", {
          fetchedUrl: String(currentUrl),
          httpStatus: Number(response.status) || 200,
        });
      }
      const contentLength = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        return unavailable(canonicalUrl, "full_context_external_body_too_large", {
          fetchedUrl: String(currentUrl),
          httpStatus: Number(response.status) || 200,
        });
      }

      let html;
      try {
        html = await readResponseTextLimited(response, maxBytes);
      } catch (error) {
        return unavailable(canonicalUrl,
          error?.code === "body_too_large" ? "full_context_external_body_too_large" : "full_context_body_read_failed",
          { fetchedUrl: String(currentUrl), httpStatus: Number(response.status) || 200 });
      }

      const parsed = extractExternalWebArticleHtml(html);
      if (!parsed) {
        return unavailable(canonicalUrl, "full_context_external_body_not_found", {
          fetchedUrl: String(currentUrl),
          httpStatus: Number(response.status) || 200,
        });
      }

      const fullText = parsed.content_text;
      const truncated = fullText.length > maxChars;
      return {
        version: EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION,
        status: "resolved",
        canonical_url: String(canonicalUrl),
        fetched_url: String(currentUrl),
        title: parsed.title,
        content_text: truncated ? fullText.slice(0, maxChars) : fullText,
        content_hash: parsed.content_hash,
        original_char_count: fullText.length,
        truncated,
        content_scope: "full_post",
        extraction_scope: parsed.extraction_scope,
        redirect_count: redirectCount,
        error_code: null,
        http_status: Number(response.status) || 200,
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseTextLimited(response, maxBytes) {
  if (!response?.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw codedError("body_too_large");
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw codedError("body_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

function unavailable(canonicalUrl, code, { fetchedUrl = null, httpStatus = null } = {}) {
  return {
    version: EXTERNAL_WEB_FULL_CONTEXT_FETCH_VERSION,
    status: "unavailable",
    canonical_url: String(canonicalUrl ?? "") || null,
    fetched_url: fetchedUrl,
    content_text: null,
    content_hash: null,
    original_char_count: null,
    truncated: false,
    content_scope: null,
    extraction_scope: null,
    redirect_count: null,
    error_code: code,
    http_status: httpStatus,
  };
}

function isPublicIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && octets[2] === 100))) return false;
  if (a === 203 && b === 0 && octets[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address) {
  if (address === "::" || address === "::1") return false;
  if (address.startsWith("2001:db8:")) return false;
  const first = Number.parseInt(address.split(":", 1)[0], 16);
  return Number.isInteger(first) && first >= 0x2000 && first <= 0x3fff;
}

function stripPageChrome(value) {
  return String(value ?? "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(?:script|style|noscript|svg|canvas|template)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|canvas|template)\s*>/gi, " ")
    .replace(/<(?:nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form)\s*>/gi, " ");
}

function extractBalancedElementContent(html, openingMatch) {
  const openingTag = openingMatch[0];
  const tagName = /^<\s*([a-z][a-z0-9:-]*)\b/i.exec(openingTag)?.[1];
  if (!tagName || /\/\s*>$/.test(openingTag)) return null;
  const contentStart = openingMatch.index + openingTag.length;
  const escapedTag = escapeRegex(tagName);
  const tokenPattern = new RegExp(
    `<!--[\\s\\S]*?-->|<script\\b[^>]*>[\\s\\S]*?<\\/script\\s*>|<style\\b[^>]*>[\\s\\S]*?<\\/style\\s*>|<${escapedTag}\\b[^>]*>|<\\/${escapedTag}\\s*>`,
    "gi",
  );
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = tokenPattern.exec(html)) !== null) {
    const token = match[0];
    if (/^<!--/i.test(token) || /^<script\b/i.test(token) || /^<style\b/i.test(token)) continue;
    if (new RegExp(`^<\\/${escapedTag}\\b`, "i").test(token)) {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, match.index);
      continue;
    }
    if (!/\/\s*>$/.test(token)) depth += 1;
  }
  return null;
}

function htmlToReadableText(value) {
  return decodeHtmlEntities(String(value ?? "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/section|\/article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMetaContent(html, property) {
  const escaped = escapeRegex(property);
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
