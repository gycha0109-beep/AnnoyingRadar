import { IDEA_CANDIDATE_SELECT } from "./service.mjs";

const BOARD_PROJECT_SELECT = [
  "id",
  "title",
  "status",
  "updated_at",
].join(", ");

const BOARD_PROBLEM_SELECT = [
  "id",
  "title",
  "status",
].join(", ");

export async function loadIdeaBoardOverview(
  serviceClient,
  userId,
  { projectId = null } = {},
) {
  const { data: projects, error: projectError } = await serviceClient
    .from("ar_research_projects")
    .select(BOARD_PROJECT_SELECT)
    .eq("user_id", userId)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (projectError) throw projectError;
  const projectList = projects ?? [];
  const projectById = new Map(projectList.map((project) => [project.id, project]));
  const selectedProject = projectId ? projectById.get(projectId) ?? null : null;

  if (projectId && !selectedProject) {
    return {
      ideas: [],
      projects: projectList,
      selected_project: null,
      invalid_project: true,
    };
  }

  let projectIdeaIds = null;
  if (projectId) {
    const { data: projectLinks, error: projectLinkError } = await serviceClient
      .from("ar_research_project_idea_links")
      .select("idea_candidate_id")
      .eq("user_id", userId)
      .eq("project_id", projectId);

    if (projectLinkError) throw projectLinkError;
    projectIdeaIds = [...new Set((projectLinks ?? []).map((link) => link.idea_candidate_id))];
    if (!projectIdeaIds.length) {
      return {
        ideas: [],
        projects: projectList,
        selected_project: selectedProject,
        invalid_project: false,
      };
    }
  }

  let ideaQuery = serviceClient
    .from("ar_idea_candidates")
    .select(IDEA_CANDIDATE_SELECT)
    .eq("user_id", userId);

  if (projectIdeaIds) ideaQuery = ideaQuery.in("id", projectIdeaIds);

  const { data: ideas, error: ideaError } = await ideaQuery
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (ideaError) throw ideaError;
  const ideaList = ideas ?? [];
  if (!ideaList.length) {
    return {
      ideas: [],
      projects: projectList,
      selected_project: selectedProject,
      invalid_project: false,
    };
  }

  const ideaIds = ideaList.map((idea) => idea.id);
  const problemIds = [...new Set(ideaList.map((idea) => idea.problem_candidate_id))];
  const [problemResult, linkResult] = await Promise.all([
    serviceClient
      .from("ar_problem_candidates")
      .select(BOARD_PROBLEM_SELECT)
      .eq("user_id", userId)
      .in("id", problemIds),
    serviceClient
      .from("ar_research_project_idea_links")
      .select("idea_candidate_id, project_id")
      .eq("user_id", userId)
      .in("idea_candidate_id", ideaIds),
  ]);

  if (problemResult.error) throw problemResult.error;
  if (linkResult.error) throw linkResult.error;

  const problemById = new Map((problemResult.data ?? []).map((problem) => [problem.id, problem]));
  const projectsByIdea = new Map();
  for (const link of linkResult.data ?? []) {
    const project = projectById.get(link.project_id);
    if (!project) continue;
    const memberships = projectsByIdea.get(link.idea_candidate_id) ?? [];
    memberships.push(project);
    projectsByIdea.set(link.idea_candidate_id, memberships);
  }

  return {
    ideas: ideaList.map((idea) => ({
      ...idea,
      problem_card: problemById.get(idea.problem_candidate_id) ?? null,
      projects: projectsByIdea.get(idea.id) ?? [],
    })),
    projects: projectList,
    selected_project: selectedProject,
    invalid_project: false,
  };
}
