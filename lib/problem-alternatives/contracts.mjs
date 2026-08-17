export const PROBLEM_ALTERNATIVE_KINDS = Object.freeze(["service", "alternative"]);
export const PROBLEM_ALTERNATIVE_NAME_MAX_LENGTH = 200;
export const PROBLEM_ALTERNATIVE_URL_MAX_LENGTH = 2000;
export const PROBLEM_ALTERNATIVE_NOTE_MAX_LENGTH = 4000;

export function normalizeProblemAlternativeCreate(body) {
  assertObject(body, "Problem alternative request must be an object");
  assertOnlyKeys(body, ["kind", "name", "url", "note"]);

  return {
    kind: normalizeKind(body.kind),
    name: normalizeName(body.name),
    url: normalizeUrl(body.url),
    note: normalizeOptionalText(body.note, PROBLEM_ALTERNATIVE_NOTE_MAX_LENGTH, "note"),
  };
}

export function normalizeProblemAlternativePatch(body) {
  assertObject(body, "Problem alternative patch must be an object");
  const keys = Object.keys(body);
  if (!keys.length) throw new Error("Problem alternative patch must not be empty");
  assertOnlyKeys(body, ["kind", "name", "url", "note"]);

  const patch = {};
  if (Object.hasOwn(body, "kind")) patch.kind = normalizeKind(body.kind);
  if (Object.hasOwn(body, "name")) patch.name = normalizeName(body.name);
  if (Object.hasOwn(body, "url")) patch.url = normalizeUrl(body.url);
  if (Object.hasOwn(body, "note")) {
    patch.note = normalizeOptionalText(body.note, PROBLEM_ALTERNATIVE_NOTE_MAX_LENGTH, "note");
  }
  return patch;
}

function normalizeKind(value) {
  if (typeof value !== "string" || !PROBLEM_ALTERNATIVE_KINDS.includes(value)) {
    throw new Error("kind must be service or alternative");
  }
  return value;
}

function normalizeName(value) {
  if (typeof value !== "string") throw new Error("name must be a string");
  const normalized = value.trim();
  if (!normalized || normalized.length > PROBLEM_ALTERNATIVE_NAME_MAX_LENGTH) {
    throw new Error(`name must contain 1 to ${PROBLEM_ALTERNATIVE_NAME_MAX_LENGTH} characters`);
  }
  return normalized;
}

function normalizeUrl(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("url must be a string or null");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > PROBLEM_ALTERNATIVE_URL_MAX_LENGTH) {
    throw new Error(`url must be at most ${PROBLEM_ALTERNATIVE_URL_MAX_LENGTH} characters`);
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("url must be a valid http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must be a valid http(s) URL");
  }
  return normalized;
}

function normalizeOptionalText(value, maxLength, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters`);
  return normalized;
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}

function assertOnlyKeys(value, allowed) {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw new Error(`Unsupported Problem alternative fields: ${unsupported.sort().join(", ")}`);
}
