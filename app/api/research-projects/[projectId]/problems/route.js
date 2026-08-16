import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import { normalizeResearchProjectProblemLinkRequest } from "../../../../../lib/research-projects/contracts.mjs";
import {
  assertResearchProjectOwner,
  mapResearchProjectRpcError,
} from "../../../../../lib/research-projects/review-api.mjs";
import { loadResearchProjectDetail } from "../../../../../lib/research-projects/service.mjs";
import { loadSavedProblemByCandidate } from "../../../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function projectIdFrom(params) {
  const resolved = await params;
  return resolved.projectId;
}

export async function POST(request, { params }) {
  try {
    const projectId = await projectIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);
    let problemCandidateId;
    try {
      problemCandidateId = normalizeResearchProjectProblemLinkRequest(body);
    } catch (error) {
      throw new ApiError(400, "invalid_research_project_problem_link", error.message);
    }

    const serviceClient = createServiceClient();
    const project = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");
    if (project.status !== "active") {
      throw new ApiError(409, "research_project_read_only", "Archived Research Project must be restored before changing links");
    }

    const candidate = await assertCandidateOwner(problemCandidateId, userId, serviceClient, "id, status");
    if (candidate.status !== "confirmed") {
      throw new ApiError(409, "confirmed_problem_card_required", "Research Project Problem link requires a confirmed Problem Card");
    }
    const savedProblem = await loadSavedProblemByCandidate(serviceClient, problemCandidateId, userId);
    if (!savedProblem) {
      throw new ApiError(409, "saved_problem_required", "Save the Problem Card before linking it to a Research Project");
    }
    if (savedProblem.status !== "active") {
      throw new ApiError(409, "active_saved_problem_required", "Restore the Saved Problem before linking it to a Research Project");
    }

    const { error } = await serviceClient.rpc("ar_link_research_project_problem", {
      p_project_id: projectId,
      p_problem_candidate_id: problemCandidateId,
      p_user_id: userId,
    });
    if (error) {
      throw mapResearchProjectRpcError(error, "research_project_problem_link_failed", "Failed to link Saved Problem");
    }

    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
