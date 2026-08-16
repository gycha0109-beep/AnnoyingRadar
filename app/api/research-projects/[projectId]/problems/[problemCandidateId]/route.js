import { NextResponse } from "next/server";

import { ApiError, assertCandidateOwner, jsonError, requireUser } from "../../../../../../lib/auth/require-user.js";
import {
  assertResearchProjectOwner,
  mapResearchProjectRpcError,
} from "../../../../../../lib/research-projects/review-api.mjs";
import { loadResearchProjectDetail } from "../../../../../../lib/research-projects/service.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function idsFrom(params) {
  const resolved = await params;
  return {
    projectId: resolved.projectId,
    problemCandidateId: resolved.problemCandidateId,
  };
}

export async function DELETE(_request, { params }) {
  try {
    const { projectId, problemCandidateId } = await idsFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    const project = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");
    if (project.status !== "active") {
      throw new ApiError(409, "research_project_read_only", "Archived Research Project must be restored before changing links");
    }
    await assertCandidateOwner(problemCandidateId, userId, serviceClient, "id");

    const { error } = await serviceClient.rpc("ar_unlink_research_project_problem", {
      p_project_id: projectId,
      p_problem_candidate_id: problemCandidateId,
      p_user_id: userId,
    });
    if (error) {
      throw mapResearchProjectRpcError(error, "research_project_problem_unlink_failed", "Failed to unlink Saved Problem");
    }

    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
