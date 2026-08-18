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
    evidence: evidence ?? [],
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
