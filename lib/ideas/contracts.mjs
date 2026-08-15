export const IDEA_STATUSES = Object.freeze([
  "candidate",
  "researching",
  "build_soon",
  "paused",
  "discarded",
  "archived",
]);

export const IMPLEMENTATION_DIFFICULTIES = Object.freeze([
  "low",
  "medium",
  "high",
  "unknown",
]);

const IDEA_STATUS_SET = new Set(IDEA_STATUSES);
const DIFFICULTY_SET = new Set(IMPLEMENTATION_DIFFICULTIES);
const PATCH_FIELDS = new Set([
  "title",
  "one_liner",
  "target_user",
  "problem_statement",
  "core_value",
  "first_build_scope",
  "excluded_scope",
  "implementation_difficulty",
  "monetization_hint",
  "first_screen_idea",
  "memo",
  "order_index",
]);

const REQUIRED_TEXT_FIELDS = new Set(["title", "one_liner", "problem_statement", "core_value", "first_build_scope"]);

const TEXT_LIMITS = Object.freeze({
  title: 200,
  one_liner: 500,
  target_user: 500,
  problem_statement: 2000,
  core_value: 1000,
  first_build_scope: 2000,
  excluded_scope: 2000,
  monetization_hint: 1000,
  first_screen_idea: 2000,
  memo: 4000,
});

const STATUS_TRANSITIONS = Object.freeze({
  candidate: new Set(["researching", "build_soon", "paused", "discarded", "archived"]),
  researching: new Set(["candidate", "build_soon", "paused", "discarded", "archived"]),
  build_soon: new Set(["candidate", "researching", "paused", "discarded", "archived"]),
  paused: new Set(["candidate", "researching", "build_soon", "discarded", "archived"]),
  discarded: new Set(["candidate", "archived"]),
  archived: new Set(["candidate", "researching", "build_soon", "paused", "discarded"]),
});

export function normalizeIdeaStatus(value) {
  const status = String(value ?? "").trim();
  if (!IDEA_STATUS_SET.has(status)) {
    throw new TypeError(`Invalid Idea Candidate status: ${status || "(empty)"}`);
  }
  return status;
}

export function canTransitionIdeaStatus(fromStatus, toStatus) {
  const from = normalizeIdeaStatus(fromStatus);
  const to = normalizeIdeaStatus(toStatus);
  if (from === to) return false;
  return STATUS_TRANSITIONS[from].has(to);
}

export function normalizeIdeaCandidatePatch(value) {
  assertPlainObject(value, "Idea Candidate patch");
  const entries = Object.entries(value);
  if (entries.length === 0) throw new TypeError("Idea Candidate patch must not be empty");

  const unknownField = entries.find(([key]) => !PATCH_FIELDS.has(key))?.[0];
  if (unknownField) throw new TypeError(`Unsupported Idea Candidate field: ${unknownField}`);

  const patch = {};
  for (const [field, rawValue] of entries) {
    if (field === "implementation_difficulty") {
      const difficulty = String(rawValue ?? "").trim();
      if (!DIFFICULTY_SET.has(difficulty)) {
        throw new TypeError(`Invalid implementation_difficulty: ${difficulty || "(empty)"}`);
      }
      patch[field] = difficulty;
      continue;
    }

    if (field === "order_index") {
      if (!Number.isInteger(rawValue) || rawValue < 0) {
        throw new TypeError("order_index must be a non-negative integer");
      }
      patch[field] = rawValue;
      continue;
    }

    const maxLength = TEXT_LIMITS[field];
    const nullable = !REQUIRED_TEXT_FIELDS.has(field);
    patch[field] = normalizeText(rawValue, field, maxLength, { nullable });
  }

  return patch;
}

export function normalizeIdeaGenerationDrafts(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new TypeError("Idea generation must contain 1 to 3 drafts");
  }

  return value.map((draft, index) => {
    assertPlainObject(draft, `Idea draft ${index + 1}`);
    const required = [
      "title",
      "one_liner",
      "target_user",
      "problem_statement",
      "core_value",
      "first_build_scope",
      "excluded_scope",
      "implementation_difficulty",
      "monetization_hint",
      "first_screen_idea",
    ];
    const unknownField = Object.keys(draft).find((key) => !required.includes(key));
    if (unknownField) throw new TypeError(`Idea draft ${index + 1} contains unsupported field ${unknownField}`);
    const missingField = required.find((key) => !(key in draft));
    if (missingField) throw new TypeError(`Idea draft ${index + 1} is missing ${missingField}`);

    return {
      title: normalizeText(draft.title, "title", TEXT_LIMITS.title, { nullable: false }),
      one_liner: normalizeText(draft.one_liner, "one_liner", TEXT_LIMITS.one_liner, { nullable: false }),
      target_user: normalizeText(draft.target_user, "target_user", TEXT_LIMITS.target_user, { nullable: true }),
      problem_statement: normalizeText(draft.problem_statement, "problem_statement", TEXT_LIMITS.problem_statement, { nullable: false }),
      core_value: normalizeText(draft.core_value, "core_value", TEXT_LIMITS.core_value, { nullable: false }),
      first_build_scope: normalizeText(draft.first_build_scope, "first_build_scope", TEXT_LIMITS.first_build_scope, { nullable: false }),
      excluded_scope: normalizeText(draft.excluded_scope, "excluded_scope", TEXT_LIMITS.excluded_scope, { nullable: true }),
      implementation_difficulty: normalizeDifficulty(draft.implementation_difficulty),
      monetization_hint: normalizeText(draft.monetization_hint, "monetization_hint", TEXT_LIMITS.monetization_hint, { nullable: true }),
      first_screen_idea: normalizeText(draft.first_screen_idea, "first_screen_idea", TEXT_LIMITS.first_screen_idea, { nullable: true }),
    };
  });
}

function normalizeDifficulty(value) {
  const difficulty = String(value ?? "").trim();
  if (!DIFFICULTY_SET.has(difficulty)) {
    throw new TypeError(`Invalid implementation_difficulty: ${difficulty || "(empty)"}`);
  }
  return difficulty;
}

function normalizeText(value, field, maxLength, { nullable }) {
  if (value === null && nullable) return null;
  if (typeof value !== "string") throw new TypeError(`${field} must be a string${nullable ? " or null" : ""}`);
  const normalized = value.trim();
  if (!normalized) {
    if (nullable) return null;
    throw new TypeError(`${field} must not be empty`);
  }
  if (normalized.length > maxLength) throw new TypeError(`${field} must be at most ${maxLength} characters`);
  return normalized;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}
