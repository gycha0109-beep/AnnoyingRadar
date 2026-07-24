const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANDIDATE_FIELDS = new Set([
  "title",
  "summary",
  "target_user",
  "situation",
  "intensity_level",
  "repeat_pattern_level",
  "clarity_level",
  "order_index",
]);

const INTENSITY_LEVELS = new Set(["low", "medium", "high", "unknown"]);
const REPEAT_LEVELS = new Set(["weak", "moderate", "strong", "unknown"]);
const CLARITY_LEVELS = new Set(["unclear", "partial", "clear", "unknown"]);

export function normalizeCandidatePatch(value, { requireTitle = false, requireSummary = false } = {}) {
  const input = objectValue(value, "Candidate patch must be an object");
  const keys = Object.keys(input);
  if (keys.length < 1) throw new TypeError("Candidate patch must not be empty");

  const unknown = keys.filter((key) => !CANDIDATE_FIELDS.has(key));
  if (unknown.length > 0) throw new TypeError(`Unsupported Candidate fields: ${unknown.join(", ")}`);

  const patch = {};
  if (Object.hasOwn(input, "title")) patch.title = requiredText(input.title, 200, "title");
  if (Object.hasOwn(input, "summary")) patch.summary = nullableText(input.summary, 2000, "summary");
  if (Object.hasOwn(input, "target_user")) {
    patch.target_user = nullableText(input.target_user, 500, "target_user");
  }
  if (Object.hasOwn(input, "situation")) {
    patch.situation = nullableText(input.situation, 500, "situation");
  }
  if (Object.hasOwn(input, "intensity_level")) {
    patch.intensity_level = nullableEnum(input.intensity_level, INTENSITY_LEVELS, "intensity_level");
  }
  if (Object.hasOwn(input, "repeat_pattern_level")) {
    patch.repeat_pattern_level = nullableEnum(
      input.repeat_pattern_level,
      REPEAT_LEVELS,
      "repeat_pattern_level",
    );
  }
  if (Object.hasOwn(input, "clarity_level")) {
    patch.clarity_level = nullableEnum(input.clarity_level, CLARITY_LEVELS, "clarity_level");
  }
  if (Object.hasOwn(input, "order_index")) {
    if (!Number.isInteger(input.order_index) || input.order_index < 0) {
      throw new TypeError("order_index must be a non-negative integer");
    }
    patch.order_index = input.order_index;
  }

  if (requireTitle && !patch.title) throw new TypeError("title is required");
  if (requireSummary && !patch.summary) throw new TypeError("summary is required");
  return patch;
}

export function normalizeDiscardRequest(value) {
  const input = value == null ? {} : objectValue(value, "Discard request must be an object");
  const unknown = Object.keys(input).filter((key) => key !== "discard_reason");
  if (unknown.length > 0) throw new TypeError(`Unsupported discard fields: ${unknown.join(", ")}`);
  return {
    discard_reason: Object.hasOwn(input, "discard_reason")
      ? nullableText(input.discard_reason, 1000, "discard_reason")
      : null,
  };
}

export function normalizeEvidenceMove(value) {
  const input = objectValue(value, "Evidence move request must be an object");
  exactKeys(input, ["evidence_id", "target_candidate_id"]);
  return {
    evidence_id: uuidValue(input.evidence_id, "evidence_id"),
    target_candidate_id: uuidValue(input.target_candidate_id, "target_candidate_id"),
  };
}

export function normalizeMergeRequest(value) {
  const input = objectValue(value, "Merge request must be an object");
  exactKeys(input, ["target_candidate_id"]);
  return { target_candidate_id: uuidValue(input.target_candidate_id, "target_candidate_id") };
}

export function normalizeSplitRequest(value) {
  const input = objectValue(value, "Split request must be an object");
  exactKeys(input, ["evidence_ids", "new_candidate"]);

  if (!Array.isArray(input.evidence_ids) || input.evidence_ids.length < 1 || input.evidence_ids.length > 19) {
    throw new TypeError("evidence_ids must contain 1 to 19 items");
  }
  const evidenceIds = input.evidence_ids.map((id) => uuidValue(id, "evidence_id"));
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new TypeError("evidence_ids must not contain duplicates");
  }

  return {
    evidence_ids: evidenceIds,
    new_candidate: normalizeCandidatePatch(input.new_candidate, {
      requireTitle: true,
      requireSummary: true,
    }),
  };
}

function objectValue(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(message);
  return value;
}

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`Expected fields: ${sortedExpected.join(", ")}`);
  }
}

function requiredText(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new TypeError(`${label} must contain 1 to ${maxLength} characters`);
  }
  return text;
}

function nullableText(value, maxLength, label) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text.length > maxLength) throw new TypeError(`${label} must be at most ${maxLength} characters`);
  return text || null;
}

function nullableEnum(value, allowed, label) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!allowed.has(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

function uuidValue(value, label) {
  const text = String(value ?? "").trim();
  if (!UUID_PATTERN.test(text)) throw new TypeError(`${label} must be a valid UUID`);
  return text;
}
