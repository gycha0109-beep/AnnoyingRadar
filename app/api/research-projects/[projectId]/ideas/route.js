import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import { assertIdeaOwner } from "../../../../../lib/ideas/review-api.mjs";
import { normalizeResearchProjectIdeaLinkRequest } from "../../../../../lib/research-projects/contracts.mjs";
import {
  assertResearchProjectOwner,
  mapResearchProjectRpcError,
} from "../../../../../lib/research-projects/review-api.mjs";
import { loadResearchProjectDetail } from "../../../../../lib/research-projects/service.mjs";
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
    let ideaId;
    try {
      ideaId = normalizeResearchProjectIdeaLinkRequest(body);
    } catch (error) {
      throw new ApiError(400, "invalid_research_project_idea_link", error.message);
    }

    const serviceClient = createServiceClient();
    const project = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");
    if (project.status !== "active") {
      throw new ApiError(409, "research_project_read_only", "Archived Research Project must be restored before changing links");
    }
    await assertIdeaOwner(ideaId, userId, serviceClient, "id");

    const { error } = await serviceClient.rpc("ar_link_research_project_idea", {
      p_project_id: projectId,
      p_idea_candidate_id: ideaId,
      p_user_id: userId,
    });
    if (error) {
      throw mapResearchProjectRpcError(error, "research_project_idea_link_failed", "Failed to link Idea Candidate");
    }

    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
