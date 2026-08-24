import { buildPublicProblemPublicationReadiness } from "./publication-readiness.mjs";

export const PUBLIC_PROBLEM_FEED_SELECT = [
  "id",
  "title",
  "summary",
  "target_user",
  "situation",
  "category",
  "status",
  "published_at",
  "created_at",
  "updated_at",
  "evidence_count",
].join(", ");

export const PUBLIC_EVIDENCE_FEED_SELECT = [
  "id",
  "public_problem_id",
  "excerpt",
  "publication_basis",
  "source_type",
  "source_label",
  "source_url",
  "source_observed_at",
  "order_index",
  "created_at",
  "updated_at",
].join(", ");

const PRIVATE_SOURCE_PROBLEM_SELECT = [
  "id",
  "title",
  "summary",
  "target_user",
  "situation",
  "status",
  "evidence_count",
  "updated_at",
].join(", ");

const CURATOR_SOURCE_SIGNAL_SELECT = [
  "id",
  "source_platform",
  "canonical_url",
  "author_handle",
  "published_at",
].join(", ");

export async function listPublishedPublicProblems(client, { q = null, category = null, limit = 20 } = {}) {
  let query = client
    .from("ar_public_problem_feed")
    .select(PUBLIC_PROBLEM_FEED_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);

  if (q) query = query.ilike("search_text", `%${q.toLowerCase()}%`);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function loadPublishedPublicProblemDetail(client, publicProblemId) {
  const { data: problem, error } = await client
    .from("ar_public_problem_feed")
    .select(PUBLIC_PROBLEM_FEED_SELECT)
    .eq("id", publicProblemId)
    .maybeSingle();
  if (error) throw error;
  if (!problem) return null;

  const { data: evidence, error: evidenceError } = await client
    .from("ar_public_problem_evidence_feed")
    .select(PUBLIC_EVIDENCE_FEED_SELECT)
    .eq("public_problem_id", publicProblemId)
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (evidenceError) throw evidenceError;

  return {
    problem,
    evidence: evidence ?? [],
  };
}

export async function loadAdminPublicProblemDetail(serviceClient, publicProblemId) {
  const { data: problem, error } = await serviceClient
    .from("ar_public_problems")
    .select("*")
    .eq("id", publicProblemId)
    .maybeSingle();
  if (error) throw error;
  if (!problem) return null;

  const { data: evidence, error: evidenceError } = await serviceClient
    .from("ar_public_problem_evidence_snapshots")
    .select("*")
    .eq("public_problem_id", publicProblemId)
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (evidenceError) throw evidenceError;

  const evidenceRows = evidence ?? [];
  const sourceSignalIds = [...new Set(evidenceRows.map((item) => item.source_signal_id).filter(Boolean))];
  const incidentIds = [...new Set(evidenceRows.map((item) => item.incident_id).filter(Boolean))];

  let incidentLinks = [];
  if (sourceSignalIds.length > 0) {
    const { data, error: incidentLinkError } = await serviceClient
      .from("ar_source_incident_links")
      .select("source_signal_id, incident_id, created_at")
      .in("source_signal_id", sourceSignalIds);
    if (incidentLinkError) throw incidentLinkError;
    incidentLinks = data ?? [];
  }

  let incidents = [];
  if (incidentIds.length > 0) {
    const { data, error: incidentError } = await serviceClient
      .from("ar_source_incidents")
      .select("id, incident_key, label, created_at, updated_at")
      .in("id", incidentIds);
    if (incidentError) throw incidentError;
    incidents = data ?? [];
  }

  let sourceSignals = [];
  if (sourceSignalIds.length > 0) {
    const { data, error: sourceSignalError } = await serviceClient
      .from("ar_source_signals")
      .select(CURATOR_SOURCE_SIGNAL_SELECT)
      .in("id", sourceSignalIds);
    if (sourceSignalError) throw sourceSignalError;
    sourceSignals = data ?? [];
  }

  const incidentById = new Map(incidents.map((item) => [item.id, item]));
  const sourceSignalById = new Map(sourceSignals.map((item) => [item.id, item]));
  const bindingSet = new Set(incidentLinks.map((item) => `${item.source_signal_id}::${item.incident_id}`));
  const enrichedEvidence = evidenceRows.map((item) => ({
    ...item,
    incident: item.incident_id ? incidentById.get(item.incident_id) ?? null : null,
    source_signal: item.source_signal_id ? sourceSignalById.get(item.source_signal_id) ?? null : null,
    incident_lineage_valid: Boolean(
      item.source_signal_id
      && item.incident_id
      && bindingSet.has(`${item.source_signal_id}::${item.incident_id}`),
    ),
  }));

  const incidentLineage = incidents
    .map((incident) => {
      const incidentEvidence = enrichedEvidence.filter((item) => item.incident_id === incident.id);
      return {
        ...incident,
        evidence_count: incidentEvidence.length,
        source_count: new Set(incidentEvidence.map((item) => item.source_signal_id).filter(Boolean)).size,
        evidence_ids: incidentEvidence.map((item) => item.id),
        source_signal_ids: [...new Set(incidentEvidence.map((item) => item.source_signal_id).filter(Boolean))],
      };
    })
    .sort((left, right) => left.incident_key.localeCompare(right.incident_key));

  const { data: lineage, error: lineageError } = await serviceClient
    .from("ar_public_problem_candidate_links")
    .select("id, public_problem_id, problem_candidate_id, linked_by_curator_user_id, created_at")
    .eq("public_problem_id", publicProblemId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (lineageError) throw lineageError;

  const candidateIds = [...new Set((lineage ?? []).map((link) => link.problem_candidate_id).filter(Boolean))];
  let sourceProblems = [];
  if (candidateIds.length > 0) {
    const { data: candidates, error: candidatesError } = await serviceClient
      .from("ar_problem_candidates")
      .select(PRIVATE_SOURCE_PROBLEM_SELECT)
      .in("id", candidateIds);
    if (candidatesError) throw candidatesError;

    const candidateById = new Map((candidates ?? []).map((candidate) => [candidate.id, candidate]));
    sourceProblems = (lineage ?? []).map((link) => ({
      ...link,
      problem: candidateById.get(link.problem_candidate_id) ?? null,
    }));
  }

  return {
    problem,
    evidence: enrichedEvidence,
    incidents: incidentLineage,
    publication_readiness: buildPublicProblemPublicationReadiness({
      problem,
      evidence: evidenceRows,
      incidentLinks,
    }),
    source_problems: sourceProblems,
  };
}

export async function listAdminPublicProblems(serviceClient, { status = null, limit = 50 } = {}) {
  let query = serviceClient
    .from("ar_public_problems")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
