export const RESEARCH_PROJECT_STATUSES = ["active", "archived"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeResearchProjectListStatus(value = "active") {
  if (value === "all") return "all";
  if (!RESEARCH_PROJECT_STATUSES.includes(value)) {
    throw new Error("Invalid Research Project status");
  }
  return value;
}

export function normalizeResearchProjectCreate(body) {
  assertPlainObject(body, "Research Project create payload must be an object");
  assertOnlyKeys(body, ["title", "purpose", "initial_problem_candidate_id"], "Research Project create");

  const title = normalizeRequiredText(body.title, "title", 200);
  const purpose = normalizeOptionalText(body.purpose, "purpose", 4000);
  let initialProblemCandidateId = null;

  if (body.initial_problem_candidate_id !== undefined && body.initial_problem_candidate_id !== null) {
    initialProblemCandidateId = normalizeUuid(
      body.initial_problem_candidate_id,
      "initial_problem_candidate_id",
    );
  }

  return {
    title,
    purpose,
    initial_problem_candidate_id: initialProblemCandidateId,
  };
}

export function normalizeResearchProjectPatch(body) {
  assertPlainObject(body, "Research Project patch must be an object");
  assertOnlyKeys(body, ["title", "purpose"], "Research Project patch");

  const patch = {};
  if (Object.hasOwn(body, "title")) {
    patch.title = normalizeRequiredText(body.title, "title", 200);
  }
  if (Object.hasOwn(body, "purpose")) {
    patch.purpose = normalizeOptionalText(body.purpose, "purpose", 4000);
  }
  if (!Object.keys(patch).length) {
    throw new Error("Research Project patch must contain title or purpose");
  }
  return patch;
}

export function normalizeResearchProjectStatusRequest(body, currentStatus) {
  assertPlainObject(body, "Research Project status request must be an object");
  assertOnlyKeys(body, ["status"], "Research Project status request");

  const status = body.status;
  if (!RESEARCH_PROJECT_STATUSES.includes(status)) {
    throw new Error("Invalid Research Project status");
  }
  if (status === currentStatus) {
    throw new Error("Research Project status transition must change status");
  }
  return status;
}

export function normalizeResearchProjectProblemLinkRequest(body) {
  return normalizeLinkRequest(body, "problem_candidate_id");
}

export function normalizeResearchProjectIdeaLinkRequest(body) {
  return normalizeLinkRequest(body, "idea_candidate_id");
}

function normalizeLinkRequest(body, field) {
  assertPlainObject(body, `Research Project ${field} link request must be an object`);
  assertOnlyKeys(body, [field], `Research Project ${field} link request`);
  if (!Object.hasOwn(body, field)) throw new Error(`${field} is required`);
  return normalizeUuid(body[field], field);
}

function normalizeRequiredText(value, field, maxLength) {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized.length || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1 to ${maxLength} characters`);
  }
  return normalized;
}

function normalizeOptionalText(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  if (value.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters`);
  const normalized = value.trim();
  return normalized || null;
}

function normalizeUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function assertOnlyKeys(body, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(body).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported ${label} field${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
  }
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}
