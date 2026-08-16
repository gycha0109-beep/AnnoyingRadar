import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import { normalizeResearchProjectStatusRequest } from "../../../../../lib/research-projects/contracts.mjs";
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

export async function PATCH(request, { params }) {
  try {
    const projectId = await projectIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);
    const serviceClient = createServiceClient();
    const current = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");

    let targetStatus;
    try {
      targetStatus = normalizeResearchProjectStatusRequest(body, current.status);
    } catch (error) {
      const message = String(error?.message ?? "Invalid Research Project status request");
      if (message.includes("must change status")) {
        throw new ApiError(409, "invalid_research_project_status_transition", message);
      }
      throw new ApiError(400, "invalid_research_project_status", message);
    }

    const { error } = await serviceClient.rpc("ar_set_research_project_status", {
      p_project_id: projectId,
      p_user_id: userId,
      p_target_status: targetStatus,
    });
    if (error) {
      throw mapResearchProjectRpcError(
        error,
        "research_project_status_update_failed",
        "Failed to update Research Project status",
      );
    }

    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
