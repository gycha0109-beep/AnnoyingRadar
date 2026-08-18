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

  return {
    problem,
    evidence: evidence ?? [],
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
