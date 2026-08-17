import { loadCandidateDetail } from "../candidates/service.mjs";
import {
  loadIdeaCandidateDetail,
  loadIdeaCandidatesForProblemCard,
} from "../ideas/service.mjs";
import { loadProblemAlternativeNotes } from "../problem-alternatives/service.mjs";
import {
  loadProjectsForIdea,
  loadProjectsForProblem,
  loadResearchProjectDetail,
} from "../research-projects/service.mjs";
import { loadSavedProblemByCandidate } from "../saved-problems/service.mjs";

export async function loadProblemCardExport(serviceClient, candidateId, userId) {
  const detail = await loadCandidateDetail(serviceClient, candidateId, userId);
  if (!detail) return null;

  const [savedProblem, alternatives, ideasResult, projects] = await Promise.all([
    loadSavedProblemByCandidate(serviceClient, candidateId, userId),
    loadProblemAlternativeNotes(serviceClient, candidateId, userId),
    loadIdeaCandidatesForProblemCard(serviceClient, candidateId, userId),
    loadProjectsForProblem(serviceClient, candidateId, userId),
  ]);

  return {
    raw_input: detail.raw_input,
    problem_card: detail.candidate,
    evidences: detail.candidate.evidences ?? [],
    saved_problem: savedProblem,
    alternatives,
    idea_candidates: ideasResult.ideas ?? [],
    projects,
  };
}

export async function loadIdeaCandidateExport(serviceClient, ideaId, userId) {
  const detail = await loadIdeaCandidateDetail(serviceClient, ideaId, userId);
  if (!detail) return null;

  const [projects, sourceProblemAlternatives] = await Promise.all([
    loadProjectsForIdea(serviceClient, ideaId, userId),
    detail.problem_card
      ? loadProblemAlternativeNotes(serviceClient, detail.problem_card.id, userId)
      : Promise.resolve([]),
  ]);

  return {
    ...detail,
    source_problem_alternatives: sourceProblemAlternatives,
    projects,
  };
}

export async function loadResearchProjectExport(serviceClient, projectId, userId) {
  const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
  if (!detail) return null;

  const problemIds = [
    ...new Set(
      detail.linked_problems
        .map((item) => item.problem_candidate_id)
        .filter(Boolean),
    ),
  ];

  const alternatives = await Promise.all(
    problemIds.map(async (problemCandidateId) => ({
      problem_candidate_id: problemCandidateId,
      notes: await loadProblemAlternativeNotes(serviceClient, problemCandidateId, userId),
    })),
  );

  return {
    ...detail,
    problem_alternatives: alternatives,
  };
}
