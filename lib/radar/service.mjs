export const PUBLIC_PROBLEM_SELECT = [
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
].join(", ");

export const PUBLIC_EVIDENCE_SELECT = [
  "id",
  "public_problem_id",
  "excerpt",
  "publication_basis",
  "source_type",
  "source_label",
  "source_url",
  "source_key",
  "source_observed_at",
  "order_index",
  "created_at",
  "updated_at",
].join(", ");

export async function listPublishedPublicProblems(client, { q = null, category = null, limit = 20 } = {}) {
  let query = client
    .from("ar_public_problems")
    .select(PUBLIC_PROBLEM_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);

  if (q) query = query.ilike("search_text", `%${q.toLowerCase()}%`);
  if (category) query = query.eq("category", category);

  const { data: problems, error } = await query;
  if (error) throw error;
  if (!problems?.length) return [];

  const ids = problems.map((problem) => problem.id);
  const { data: snapshots, error: evidenceError } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select("public_problem_id, source_key")
    .in("public_problem_id", ids);
  if (evidenceError) throw evidenceError;

  const metrics = new Map();
  for (const problem of problems) {
    metrics.set(problem.id, { evidence_count: 0, sources: new Set() });
  }
  for (const snapshot of snapshots ?? []) {
    const current = metrics.get(snapshot.public_problem_id);
    if (!current) continue;
    current.evidence_count += 1;
    current.sources.add(snapshot.source_key);
  }

  return problems.map((problem) => {
    const metric = metrics.get(problem.id);
    return {
      ...problem,
      evidence_count: metric?.evidence_count ?? 0,
      source_count: metric?.sources.size ?? 0,
    };
  });
}

export async function loadPublishedPublicProblemDetail(client, publicProblemId) {
  const { data: problem, error } = await client
    .from("ar_public_problems")
    .select(PUBLIC_PROBLEM_SELECT)
    .eq("id", publicProblemId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!problem) return null;

  const { data: evidence, error: evidenceError } = await client
    .from("ar_public_problem_evidence_snapshots")
    .select(PUBLIC_EVIDENCE_SELECT)
    .eq("public_problem_id", publicProblemId)
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (evidenceError) throw evidenceError;

  const sourceKeys = new Set((evidence ?? []).map((item) => item.source_key));
  return {
    problem: {
      ...problem,
      evidence_count: evidence?.length ?? 0,
      source_count: sourceKeys.size,
    },
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
