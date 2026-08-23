export const COMPLAINT_SEMANTIC_VERSION = "complaint-semantic-v0.1";
export const COMPLAINT_SILVER_VERSION = "complaint-silver-v0.1";
export const COMPLAINT_PRIMARY_PROMPT_VERSION = "complaint-semantic-primary-v0.1";
export const COMPLAINT_SECONDARY_PROMPT_VERSION = "complaint-semantic-secondary-v0.1";
export const HUMAN_EVALUATION_VERSION = "human-eval-v0.1";

export const PROBLEM_CLAIM_VALUES = Object.freeze(["yes", "no", "uncertain"]);
export const EXPERIENCE_ACTOR_VALUES = Object.freeze(["self", "other", "generic", "unknown", "not_applicable"]);
export const FRICTION_SPECIFICITY_VALUES = Object.freeze(["concrete", "vague", "none", "unknown"]);
export const CONTENT_KIND_VALUES = Object.freeze(["organic", "advertisement", "news", "repost", "informational", "unknown"]);
export const SEMANTIC_GATE_DECISIONS = Object.freeze(["pass", "review", "reject"]);

const PROBLEM_CLAIM = new Set(PROBLEM_CLAIM_VALUES);
const EXPERIENCE_ACTOR = new Set(EXPERIENCE_ACTOR_VALUES);
const FRICTION_SPECIFICITY = new Set(FRICTION_SPECIFICITY_VALUES);
const CONTENT_KIND = new Set(CONTENT_KIND_VALUES);
const NON_ORGANIC_KINDS = new Set(["advertisement", "news", "repost", "informational"]);

export class SemanticContractError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = "SemanticContractError";
    this.code = code;
    this.status = status;
  }
}

export function deriveSemanticGateDecision(value) {
  validateSemanticAxes(value);

  if (value.problem_claim === "no") return "reject";
  if (["other", "generic", "not_applicable"].includes(value.experience_actor)) return "reject";
  if (["vague", "none"].includes(value.friction_specificity)) return "reject";
  if (NON_ORGANIC_KINDS.has(value.content_kind)) return "reject";

  if (
    value.problem_claim === "yes"
    && value.experience_actor === "self"
    && value.friction_specificity === "concrete"
    && value.content_kind === "organic"
  ) return "pass";

  return "review";
}

export function needsSecondaryJudge({ judgment, prefilterDecision = "continue" }) {
  const semanticDecision = deriveSemanticGateDecision(judgment);
  if (prefilterDecision === "review") return true;
  if (semanticDecision === "review") return true;
  if (judgment.problem_claim === "uncertain") return true;
  if (judgment.experience_actor === "unknown") return true;
  if (judgment.friction_specificity === "unknown") return true;
  if (judgment.content_kind === "unknown") return true;
  return false;
}

export function semanticJudgmentsAgree(left, right) {
  return left.problem_claim === right.problem_claim
    && left.experience_actor === right.experience_actor
    && left.friction_specificity === right.friction_specificity
    && left.content_kind === right.content_kind;
}

export function resolveSemanticGate({ prefilter, primary, secondary = null }) {
  if (prefilter.decision === "reject") {
    return {
      final_decision: "reject",
      system_certainty: "high",
      resolution_reason_codes: ["prefilter_hard_reject"],
      semantic: {
        problem_claim: "no",
        experience_actor: "not_applicable",
        friction_specificity: "none",
        content_kind: "unknown",
        evidence_quote: null,
      },
    };
  }

  const primaryDecision = deriveSemanticGateDecision(primary);
  if (!secondary) {
    return {
      final_decision: primaryDecision,
      system_certainty: primaryDecision === "review" ? "low" : "high",
      resolution_reason_codes: [
        primaryDecision === "pass" ? "first_hand_concrete_friction" :
          primaryDecision === "reject" ? "semantic_reject" : "semantic_uncertainty",
      ],
      semantic: primary,
    };
  }

  if (!semanticJudgmentsAgree(primary, secondary)) {
    return {
      final_decision: "review",
      system_certainty: "low",
      resolution_reason_codes: ["judge_disagreement"],
      semantic: primary,
    };
  }

  if (prefilter.decision === "review" && primaryDecision === "pass") {
    return {
      final_decision: "review",
      system_certainty: "low",
      resolution_reason_codes: ["rule_signal_conflict", "secondary_agreement"],
      semantic: primary,
    };
  }

  return {
    final_decision: primaryDecision,
    system_certainty: primaryDecision === "review" ? "low" : "medium",
    resolution_reason_codes: [
      "secondary_agreement",
      primaryDecision === "pass" ? "first_hand_concrete_friction" :
        primaryDecision === "reject" ? "semantic_reject" : "semantic_uncertainty",
    ],
    semantic: primary,
  };
}

export function normalizeSemanticJudgment(value, rawText = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SemanticContractError("invalid_semantic_judgment", "Semantic judgment must be an object");
  }

  const allowed = new Set([
    "problem_claim",
    "experience_actor",
    "friction_specificity",
    "content_kind",
    "evidence_quote",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new SemanticContractError("invalid_semantic_judgment", `Unsupported semantic field: ${unknown}`);
  const missing = [...allowed].find((key) => !(key in value));
  if (missing) throw new SemanticContractError("invalid_semantic_judgment", `Semantic judgment is missing ${missing}`);

  validateSemanticAxes(value);
  const evidenceQuote = normalizeEvidenceQuote(value.evidence_quote, rawText);
  if (value.problem_claim === "yes" && !evidenceQuote) {
    throw new SemanticContractError("invalid_semantic_evidence", "problem_claim=yes requires evidence_quote");
  }

  return {
    problem_claim: value.problem_claim,
    experience_actor: value.experience_actor,
    friction_specificity: value.friction_specificity,
    content_kind: value.content_kind,
    evidence_quote: evidenceQuote,
  };
}

export function normalizeHumanEvaluationInput(value, rawText = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SemanticContractError("invalid_human_evaluation", "Human evaluation body must be an object");
  }

  const semantic = normalizeSemanticJudgment({
    problem_claim: value.problem_claim,
    experience_actor: value.experience_actor,
    friction_specificity: value.friction_specificity,
    content_kind: value.content_kind,
    evidence_quote: value.evidence_quote ?? null,
  }, rawText);

  const annotatorNote = optionalString(value.annotator_note, 4000);
  return { ...semantic, annotator_note: annotatorNote };
}

function validateSemanticAxes(value) {
  if (!PROBLEM_CLAIM.has(value.problem_claim)) {
    throw new SemanticContractError("invalid_problem_claim", "problem_claim is invalid");
  }
  if (!EXPERIENCE_ACTOR.has(value.experience_actor)) {
    throw new SemanticContractError("invalid_experience_actor", "experience_actor is invalid");
  }
  if (!FRICTION_SPECIFICITY.has(value.friction_specificity)) {
    throw new SemanticContractError("invalid_friction_specificity", "friction_specificity is invalid");
  }
  if (!CONTENT_KIND.has(value.content_kind)) {
    throw new SemanticContractError("invalid_content_kind", "content_kind is invalid");
  }
}

function normalizeEvidenceQuote(value, rawText) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) {
    throw new SemanticContractError("invalid_semantic_evidence", "evidence_quote must be null or a string up to 2000 characters");
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (typeof rawText === "string" && !rawText.includes(normalized)) {
    throw new SemanticContractError("invalid_semantic_evidence", "evidence_quote must be an exact contiguous Source Signal excerpt");
  }
  return normalized;
}

function optionalString(value, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new SemanticContractError("invalid_human_evaluation", `annotator_note must be at most ${maxLength} characters`);
  }
  return value.trim() || null;
}
