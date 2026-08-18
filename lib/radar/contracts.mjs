const PUBLIC_PROBLEM_STATUSES = new Set(["draft", "published", "archived"]);
const PUBLICATION_BASES = new Set(["external_public", "user_opt_in"]);

function expectObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function optionalText(value, { max, label }) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string or null`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new RangeError(`${label} must be at most ${max} characters`);
  return normalized;
}

function requiredText(value, { min = 1, max, label }) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new RangeError(`${label} must contain ${min} to ${max} characters`);
  }
  return normalized;
}

function optionalInteger(value, { min = 0, label }) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${label} must be an integer >= ${min}`);
  return value;
}

export function normalizePublicProblemCreate(body) {
  const value = expectObject(body, "body");
  return {
    title: requiredText(value.title, { max: 240, label: "title" }),
    summary: requiredText(value.summary, { max: 4000, label: "summary" }),
    target_user: optionalText(value.target_user, { max: 1000, label: "target_user" }),
    situation: optionalText(value.situation, { max: 2000, label: "situation" }),
    category: optionalText(value.category, { max: 120, label: "category" }),
  };
}

export function normalizePublicProblemPatch(body) {
  const value = expectObject(body, "body");
  const allowed = new Set(["title", "summary", "target_user", "situation", "category"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`unsupported Public Problem field: ${key}`);
  }
  if (Object.keys(value).length === 0) throw new TypeError("Public Problem patch must not be empty");

  const patch = {};
  if (Object.hasOwn(value, "title")) patch.title = requiredText(value.title, { max: 240, label: "title" });
  if (Object.hasOwn(value, "summary")) patch.summary = requiredText(value.summary, { max: 4000, label: "summary" });
  if (Object.hasOwn(value, "target_user")) patch.target_user = optionalText(value.target_user, { max: 1000, label: "target_user" });
  if (Object.hasOwn(value, "situation")) patch.situation = optionalText(value.situation, { max: 2000, label: "situation" });
  if (Object.hasOwn(value, "category")) patch.category = optionalText(value.category, { max: 120, label: "category" });
  return patch;
}

export function normalizePublicProblemStatus(value) {
  if (typeof value !== "string" || !PUBLIC_PROBLEM_STATUSES.has(value)) {
    throw new TypeError("status must be draft, published, or archived");
  }
  return value;
}

export function normalizePublicEvidenceCreate(body) {
  const value = expectObject(body, "body");
  const basis = value.publication_basis;
  if (typeof basis !== "string" || !PUBLICATION_BASES.has(basis)) {
    throw new TypeError("publication_basis must be external_public or user_opt_in");
  }

  let sourceObservedAt = null;
  if (value.source_observed_at !== null && value.source_observed_at !== undefined && value.source_observed_at !== "") {
    if (typeof value.source_observed_at !== "string" || Number.isNaN(Date.parse(value.source_observed_at))) {
      throw new TypeError("source_observed_at must be a valid date-time string or null");
    }
    sourceObservedAt = new Date(value.source_observed_at).toISOString();
  }

  return {
    excerpt: requiredText(value.excerpt, { max: 600, label: "excerpt" }),
    publication_basis: basis,
    source_type: optionalText(value.source_type, { max: 120, label: "source_type" }),
    source_label: optionalText(value.source_label, { max: 240, label: "source_label" }),
    source_url: optionalText(value.source_url, { max: 2000, label: "source_url" }),
    source_key: requiredText(value.source_key, { max: 500, label: "source_key" }),
    source_observed_at: sourceObservedAt,
    order_index: optionalInteger(value.order_index, { label: "order_index" }),
  };
}

export function normalizePublicEvidencePatch(body) {
  const value = expectObject(body, "body");
  const allowed = new Set([
    "excerpt",
    "publication_basis",
    "source_type",
    "source_label",
    "source_url",
    "source_key",
    "source_observed_at",
    "order_index",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`unsupported Public Evidence field: ${key}`);
  }
  if (Object.keys(value).length === 0) throw new TypeError("Public Evidence patch must not be empty");

  const patch = {};
  if (Object.hasOwn(value, "excerpt")) patch.excerpt = requiredText(value.excerpt, { max: 600, label: "excerpt" });
  if (Object.hasOwn(value, "publication_basis")) {
    if (typeof value.publication_basis !== "string" || !PUBLICATION_BASES.has(value.publication_basis)) {
      throw new TypeError("publication_basis must be external_public or user_opt_in");
    }
    patch.publication_basis = value.publication_basis;
  }
  if (Object.hasOwn(value, "source_type")) patch.source_type = optionalText(value.source_type, { max: 120, label: "source_type" });
  if (Object.hasOwn(value, "source_label")) patch.source_label = optionalText(value.source_label, { max: 240, label: "source_label" });
  if (Object.hasOwn(value, "source_url")) patch.source_url = optionalText(value.source_url, { max: 2000, label: "source_url" });
  if (Object.hasOwn(value, "source_key")) patch.source_key = requiredText(value.source_key, { max: 500, label: "source_key" });
  if (Object.hasOwn(value, "source_observed_at")) {
    if (value.source_observed_at === null || value.source_observed_at === "") {
      patch.source_observed_at = null;
    } else if (typeof value.source_observed_at === "string" && !Number.isNaN(Date.parse(value.source_observed_at))) {
      patch.source_observed_at = new Date(value.source_observed_at).toISOString();
    } else {
      throw new TypeError("source_observed_at must be a valid date-time string or null");
    }
  }
  if (Object.hasOwn(value, "order_index")) patch.order_index = optionalInteger(value.order_index, { label: "order_index" });
  return patch;
}

export function normalizePublicProblemListQuery(searchParams) {
  const qRaw = searchParams.get("q");
  const categoryRaw = searchParams.get("category");
  const limitRaw = searchParams.get("limit");

  const q = optionalText(qRaw, { max: 120, label: "q" });
  const category = optionalText(categoryRaw, { max: 120, label: "category" });
  let limit = 20;
  if (limitRaw !== null && limitRaw !== "") {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new RangeError("limit must be an integer between 1 and 50");
    }
    limit = parsed;
  }

  return { q, category, limit };
}
