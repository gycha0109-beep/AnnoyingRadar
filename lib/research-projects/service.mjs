export const RESEARCH_PROJECT_SELECT = [
  "id",
  "user_id",
  "title",
  "purpose",
  "status",
  "created_at",
  "updated_at",
].join(", ");

const PROBLEM_CARD_SELECT = [
  "id",
  "raw_input_id",
  "title",
  "summary",
  "target_user",
  "situation",
  "evidence_count",
  "intensity_level",
  "repeat_pattern_level",
  "clarity_level",
  "status",
  "created_at",
  "updated_at",
].join(", ");

const SAVED_PROBLEM_SELECT = [
  "problem_candidate_id",
  "user_id",
  "category",
  "memo",
  "status",
  "created_at",
  "updated_at",
].join(", ");

const IDEA_SELECT = [
  "id",
  "user_id",
  "problem_candidate_id",
  "title",
  "one_liner",
  "implementation_difficulty",
  "status",
  "updated_at",
  "created_at",
].join(", ");

export async function loadResearchProjectById(serviceClient, projectId, userId) {
  const { data, error } = await serviceClient
    .from("ar_research_projects")
    .select(RESEARCH_PROJECT_SELECT)
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function loadResearchProjectOverview(
  serviceClient,
  userId,
  { status = "active" } = {},
) {
  let query = serviceClient
    .from("ar_research_projects")
    .select(RESEARCH_PROJECT_SELECT)
    .eq("user_id", userId);

  if (status !== "all") query = query.eq("status", status);

  const { data: projects, error: projectError } = await query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (projectError) throw projectError;
  if (!(projects ?? []).length) return [];

  const projectIds = projects.map((project) => project.id);
  const [problemResult, ideaResult] = await Promise.all([
    serviceClient
      .from("ar_research_project_problem_links")
      .select("project_id")
      .eq("user_id", userId)
      .in("project_id", projectIds),
    serviceClient
      .from("ar_research_project_idea_links")
      .select("project_id")
      .eq("user_id", userId)
      .in("project_id", projectIds),
  ]);

  if (problemResult.error) throw problemResult.error;
  if (ideaResult.error) throw ideaResult.error;

  const problemCounts = countByProject(problemResult.data ?? []);
  const ideaCounts = countByProject(ideaResult.data ?? []);

  return projects.map((project) => ({
    ...project,
    linked_problem_count: problemCounts.get(project.id) ?? 0,
    linked_idea_count: ideaCounts.get(project.id) ?? 0,
  }));
}

export async function loadResearchProjectDetail(serviceClient, projectId, userId) {
  const project = await loadResearchProjectById(serviceClient, projectId, userId);
  if (!project) return null;

  const [problemLinkResult, ideaLinkResult] = await Promise.all([
    serviceClient
      .from("ar_research_project_problem_links")
      .select("project_id, problem_candidate_id, created_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    serviceClient
      .from("ar_research_project_idea_links")
      .select("project_id, idea_candidate_id, created_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (problemLinkResult.error) throw problemLinkResult.error;
  if (ideaLinkResult.error) throw ideaLinkResult.error;

  const problemLinks = problemLinkResult.data ?? [];
  const ideaLinks = ideaLinkResult.data ?? [];
  const problemIds = problemLinks.map((link) => link.problem_candidate_id);
  const ideaIds = ideaLinks.map((link) => link.idea_candidate_id);

  const [savedProblems, problemCards, ideas] = await Promise.all([
    loadSavedProblems(serviceClient, problemIds, userId),
    loadProblemCards(serviceClient, problemIds, userId),
    loadIdeas(serviceClient, ideaIds, userId),
  ]);

  const savedById = new Map(savedProblems.map((item) => [item.problem_candidate_id, item]));
  const problemById = new Map(problemCards.map((item) => [item.id, item]));

  const sourceProblemIds = [...new Set(ideas.map((idea) => idea.problem_candidate_id))];
  const ideaSourceProblems = await loadProblemCards(serviceClient, sourceProblemIds, userId);
  const ideaSourceById = new Map(ideaSourceProblems.map((item) => [item.id, item]));
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]));

  return {
    project,
    linked_problems: problemLinks.map((link) => ({
      ...link,
      saved_problem: savedById.get(link.problem_candidate_id) ?? null,
      problem_card: problemById.get(link.problem_candidate_id) ?? null,
    })),
    linked_ideas: ideaLinks.map((link) => {
      const idea = ideaById.get(link.idea_candidate_id) ?? null;
      return {
        ...link,
        idea,
        problem_card: idea ? ideaSourceById.get(idea.problem_candidate_id) ?? null : null,
      };
    }),
  };
}

export async function loadProjectsForProblem(serviceClient, problemCandidateId, userId) {
  const { data: links, error } = await serviceClient
    .from("ar_research_project_problem_links")
    .select("project_id, problem_candidate_id, created_at")
    .eq("problem_candidate_id", problemCandidateId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return attachProjectsToLinks(serviceClient, links ?? [], userId);
}

export async function loadProjectsForIdea(serviceClient, ideaId, userId) {
  const { data: links, error } = await serviceClient
    .from("ar_research_project_idea_links")
    .select("project_id, idea_candidate_id, created_at")
    .eq("idea_candidate_id", ideaId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return attachProjectsToLinks(serviceClient, links ?? [], userId);
}

async function attachProjectsToLinks(serviceClient, links, userId) {
  if (!links.length) return [];
  const projectIds = [...new Set(links.map((link) => link.project_id))];
  const { data: projects, error } = await serviceClient
    .from("ar_research_projects")
    .select(RESEARCH_PROJECT_SELECT)
    .eq("user_id", userId)
    .in("id", projectIds);

  if (error) throw error;
  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  return links
    .map((link) => ({ ...link, project: projectById.get(link.project_id) ?? null }))
    .filter((item) => item.project);
}

async function loadSavedProblems(serviceClient, ids, userId) {
  if (!ids.length) return [];
  const { data, error } = await serviceClient
    .from("ar_saved_problem_cards")
    .select(SAVED_PROBLEM_SELECT)
    .eq("user_id", userId)
    .in("problem_candidate_id", ids);
  if (error) throw error;
  return data ?? [];
}

async function loadProblemCards(serviceClient, ids, userId) {
  if (!ids.length) return [];
  const { data, error } = await serviceClient
    .from("ar_problem_candidates")
    .select(PROBLEM_CARD_SELECT)
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

async function loadIdeas(serviceClient, ids, userId) {
  if (!ids.length) return [];
  const { data, error } = await serviceClient
    .from("ar_idea_candidates")
    .select(IDEA_SELECT)
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

function countByProject(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  return counts;
}
