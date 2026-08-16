export const SAVED_PROBLEM_STATUSES = Object.freeze(["active", "archived"]);

const STATUS_SET = new Set(SAVED_PROBLEM_STATUSES);
const PATCH_FIELDS = new Set(["category", "memo"]);
const TEXT_LIMITS = Object.freeze({
  category: 120,
  memo: 4000,
});

export function normalizeSavedProblemPatch(value) {
  assertPlainObject(value, "Saved Problem patch");
  const entries = Object.entries(value);
  if (entries.length === 0) throw new TypeError("Saved Problem patch must not be empty");

  const unknownField = entries.find(([key]) => !PATCH_FIELDS.has(key))?.[0];
  if (unknownField) throw new TypeError(`Unsupported Saved Problem field: ${unknownField}`);

  const patch = {};
  for (const [field, rawValue] of entries) {
    patch[field] = normalizeNullableText(rawValue, field, TEXT_LIMITS[field]);
  }
  return patch;
}

export function normalizeSavedProblemStatus(value) {
  const status = String(value ?? "").trim();
  if (!STATUS_SET.has(status)) {
    throw new TypeError(`Invalid Saved Problem status: ${status || "(empty)"}`);
  }
  return status;
}

export function normalizeSavedProblemStatusRequest(value, currentStatus) {
  assertPlainObject(value, "Saved Problem status request");
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "status") {
    throw new TypeError("Saved Problem status request must contain only status");
  }

  const current = normalizeSavedProblemStatus(currentStatus);
  const target = normalizeSavedProblemStatus(value.status);
  if (current === target) {
    throw new TypeError("Saved Problem status transition must change status");
  }
  return target;
}

export function normalizeSavedProblemListStatus(value) {
  const status = String(value ?? "active").trim();
  if (status === "all") return status;
  return normalizeSavedProblemStatus(status);
}

export function savedProblemEligibility(candidate, rawInput) {
  if (!candidate || !rawInput) {
    return { eligible: false, reason: "source_unavailable" };
  }
  if (candidate.status !== "confirmed") {
    return { eligible: false, reason: "confirmed_problem_card_required" };
  }
  if (rawInput.analysis_status !== "completed") {
    return { eligible: false, reason: "completed_analysis_required" };
  }
  if (!Number.isInteger(candidate.evidence_count) || candidate.evidence_count < 1) {
    return { eligible: false, reason: "problem_card_evidence_required" };
  }
  return { eligible: true, reason: null };
}

function normalizeNullableText(value, field, maxLength) {
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${field} must be a string or null`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new TypeError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}
