export const SOURCE_PROBLEM_FORMATION_VERSION = "source-problem-formation-v0.1";
export const SOURCE_PROBLEM_FORMATION_STATES = Object.freeze([
  "eligible",
  "provenance_review",
  "review",
  "reject",
]);

const PROBLEM_CLAIM_VALUES = Object.freeze(["yes", "no", "unclear"]);
const EXPERIENCE_ACTOR_VALUES = Object.freeze([
  "self",
  "specific_other",
  "reported_population",
  "generic",
  "unknown",
]);
const FRICTION_SPECIFICITY_VALUES = Object.freeze(["concrete", "vague", "none", "unknown"]);
const PAIN_CENTRALITY_VALUES = Object.freeze(["central", "incidental", "unclear"]);
const CONTENT_KIND_VALUES = Object.freeze([
  "organic",
  "news",
  "repost",
  "informational",
  "advertisement",
  "unknown",
]);
const SOURCE_ORIGIN_VALUES = Object.freeze(["original", "derivative", "unknown"]);
const FRICTION_RESPONSIBILITY_VALUES = Object.freeze([
  "external_service_or_product",
  "external_process_or_policy",
  "structural_system",
  "contractual_term",
  "self_caused",
  "natural_event_only",
  "mixed",
  "unknown",
]);

const ELIGIBLE_RESPONSIBILITIES = new Set([
  "external_service_or_product",
  "external_process_or_policy",
  "structural_system",
]);
const ELIGIBLE_ACTORS = new Set(["self", "specific_other", "reported_population"]);
const ELIGIBLE_CONTENT_KINDS = new Set(["organic", "news"]);

export function normalizeProblemFormationSemantic(value, fullText = null) {
  const input = value && typeof value === "object" ? value : {};
  const evidenceQuote = typeof input.evidence_quote === "string" && input.evidence_quote.trim()
    ? input.evidence_quote.trim()
    : null;
  const sourceText = typeof fullText === "string" ? fullText : null;

  return {
    problem_claim: enumOr(input.problem_claim, PROBLEM_CLAIM_VALUES, "unclear"),
    experience_actor: enumOr(input.experience_actor, EXPERIENCE_ACTOR_VALUES, "unknown"),
    friction_specificity: enumOr(input.friction_specificity, FRICTION_SPECIFICITY_VALUES, "unknown"),
    pain_centrality: enumOr(input.pain_centrality, PAIN_CENTRALITY_VALUES, "unclear"),
    content_kind: enumOr(input.content_kind, CONTENT_KIND_VALUES, "unknown"),
    source_origin: enumOr(input.source_origin, SOURCE_ORIGIN_VALUES, "unknown"),
    friction_responsibility: enumOr(
      input.friction_responsibility,
      FRICTION_RESPONSIBILITY_VALUES,
      "unknown",
    ),
    evidence_quote: evidenceQuote,
    evidence_quote_grounded: sourceText === null
      ? null
      : Boolean(evidenceQuote && sourceText.includes(evidenceQuote)),
  };
}

export function resolveProblemFormationSemantic(semantic, { fullText = null } = {}) {
  const normalized = normalizeProblemFormationSemantic(semantic, fullText);

  if (normalized.problem_claim === "no") {
    return formationDecision("reject", "formation_no_problem_claim", normalized);
  }
  if (["advertisement", "informational"].includes(normalized.content_kind)) {
    return formationDecision("reject", "formation_non_evidence_content", normalized);
  }
  if (normalized.pain_centrality === "incidental") {
    return formationDecision("reject", "formation_incidental_friction", normalized);
  }
  if (normalized.friction_specificity === "none") {
    return formationDecision("reject", "formation_no_specific_friction", normalized);
  }
  if (["self_caused", "contractual_term", "natural_event_only"].includes(normalized.friction_responsibility)) {
    return formationDecision("reject", `formation_${normalized.friction_responsibility}`, normalized);
  }

  // A derivative/reposted source may still point at a valid problem, but it is
  // not publication provenance until the original source is resolved.
  if (normalized.source_origin === "derivative" || normalized.content_kind === "repost") {
    return formationDecision("provenance_review", "formation_original_source_required", normalized);
  }

  if (fullText !== null && !normalized.evidence_quote_grounded) {
    return formationDecision("review", "formation_evidence_quote_unverified", normalized, false);
  }
  if (!normalized.evidence_quote) {
    return formationDecision("review", "formation_evidence_quote_required", normalized, false);
  }

  const uncertain = normalized.problem_claim === "unclear"
    || normalized.experience_actor === "unknown"
    || normalized.friction_specificity === "unknown"
    || normalized.pain_centrality === "unclear"
    || normalized.content_kind === "unknown"
    || normalized.source_origin === "unknown"
    || normalized.friction_responsibility === "unknown"
    || normalized.friction_responsibility === "mixed";
  if (uncertain) {
    return formationDecision("review", "formation_semantic_uncertain", normalized, false);
  }

  if (normalized.experience_actor === "generic") {
    return formationDecision("reject", "formation_no_attributable_experience", normalized);
  }

  const eligible = normalized.problem_claim === "yes"
    && normalized.friction_specificity === "concrete"
    && normalized.pain_centrality === "central"
    && normalized.source_origin === "original"
    && ELIGIBLE_ACTORS.has(normalized.experience_actor)
    && ELIGIBLE_CONTENT_KINDS.has(normalized.content_kind)
    && ELIGIBLE_RESPONSIBILITIES.has(normalized.friction_responsibility);

  if (eligible) {
    return formationDecision("eligible", "formation_grounded_external_friction", normalized);
  }

  return formationDecision("review", "formation_semantic_boundary", normalized, false);
}

/**
 * Incident identity is upstream curator/semantic work. This helper does not
 * invent or merge incident keys; it only prevents multiple source rows for the
 * same supplied incident from inflating repeated-problem evidence.
 */
export function buildIncidentAwareProblemClusters(rows) {
  const eligible = (rows ?? []).filter((row) => row?.formation_state === "eligible");
  const clusters = new Map();

  for (const row of eligible) {
    const problemSignature = cleanKey(row?.problem_signature);
    const incidentKey = cleanKey(row?.incident_key);
    const sourceSignalId = cleanKey(row?.source_signal_id);
    if (!problemSignature || !incidentKey || !sourceSignalId) continue;

    let cluster = clusters.get(problemSignature);
    if (!cluster) {
      cluster = {
        problem_signature: problemSignature,
        source_signal_ids: new Set(),
        incident_keys: new Set(),
      };
      clusters.set(problemSignature, cluster);
    }
    cluster.source_signal_ids.add(sourceSignalId);
    cluster.incident_keys.add(incidentKey);
  }

  return [...clusters.values()]
    .map((cluster) => ({
      problem_signature: cluster.problem_signature,
      source_count: cluster.source_signal_ids.size,
      incident_count: cluster.incident_keys.size,
      source_signal_ids: [...cluster.source_signal_ids].sort(),
      incident_keys: [...cluster.incident_keys].sort(),
      repeat_eligible: cluster.incident_keys.size >= 2,
    }))
    .sort((left, right) => left.problem_signature.localeCompare(right.problem_signature));
}

export function summarizeProblemFormationAudit(rows) {
  const summary = {
    total: 0,
    eligible: 0,
    provenance_review: 0,
    review: 0,
    reject: 0,
    eligible_incidents: 0,
    repeated_problem_clusters: 0,
  };

  const incidentKeys = new Set();
  for (const row of rows ?? []) {
    summary.total += 1;
    const state = SOURCE_PROBLEM_FORMATION_STATES.includes(row?.formation_state)
      ? row.formation_state
      : "review";
    summary[state] += 1;
    if (state === "eligible") {
      const incidentKey = cleanKey(row?.incident_key);
      if (incidentKey) incidentKeys.add(incidentKey);
    }
  }
  summary.eligible_incidents = incidentKeys.size;
  summary.repeated_problem_clusters = buildIncidentAwareProblemClusters(rows)
    .filter((cluster) => cluster.repeat_eligible).length;
  return summary;
}

function formationDecision(state, reasonCode, semantic, resolved = true) {
  return {
    version: SOURCE_PROBLEM_FORMATION_VERSION,
    formation_state: state,
    resolved,
    reason_codes: [reasonCode],
    semantic,
  };
}

function enumOr(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
