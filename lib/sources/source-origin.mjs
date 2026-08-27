export const SOURCE_ORIGIN_CLASSIFIER_VERSION = "source-origin-v0.1";

const NAVER_BLOG_HOSTS = new Set(["blog.naver.com", "m.blog.naver.com"]);
const SOURCE_ORIGIN_HOST_PATTERN = /^[a-z0-9.-]{1,253}$/;

export function normalizeSourceOriginHost(value) {
  const host = String(value ?? "").trim().toLowerCase().replace(/^www\./, "");
  return SOURCE_ORIGIN_HOST_PATTERN.test(host) ? host : null;
}

export function classifySourceOrigin(canonicalUrl) {
  let url;
  try {
    url = new URL(String(canonicalUrl ?? "").trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = normalizeSourceOriginHost(url.hostname);
  if (!host) return null;

  return {
    kind: NAVER_BLOG_HOSTS.has(host) ? "naver_blog" : "external_web",
    host,
    classifier_version: SOURCE_ORIGIN_CLASSIFIER_VERSION,
  };
}

export function resolveSignalSourceOrigin(signal) {
  const explicitKind = typeof signal?.source_origin_kind === "string"
    ? signal.source_origin_kind.trim()
    : "";
  const explicitHost = normalizeSourceOriginHost(signal?.source_origin_host);
  const explicitVersion = typeof signal?.source_origin_classifier_version === "string"
    ? signal.source_origin_classifier_version.trim()
    : "";

  if (explicitKind && explicitHost && explicitVersion) {
    return {
      kind: explicitKind,
      host: explicitHost,
      classifier_version: explicitVersion,
      resolution: "explicit",
    };
  }

  const inferred = classifySourceOrigin(signal?.canonical_url);
  if (!inferred) return null;
  return {
    ...inferred,
    resolution: "inferred_legacy",
  };
}
