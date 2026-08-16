import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../lib/candidates/review-api.mjs";
import { normalizeResearchProjectPatch } from "../../../../lib/research-projects/contracts.mjs";
import {
  assertResearchProjectOwner,
  mapResearchProjectRpcError,
} from "../../../../lib/research-projects/review-api.mjs";
import { loadResearchProjectDetail } from "../../../../lib/research-projects/service.mjs";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function projectIdFrom(params) {
  const resolved = await params;
  return resolved.projectId;
}

export async function GET(_request, { params }) {
  try {
    const projectId = await projectIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const projectId = await projectIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let patch;
    try {
      patch = normalizeResearchProjectPatch(body);
    } catch (error) {
      throw new ApiError(400, "invalid_research_project_patch", error.message);
    }

    const serviceClient = createServiceClient();
    const current = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");
    if (current.status !== "active") {
      throw new ApiError(
        409,
        "research_project_read_only",
        "Archived Research Project must be restored before editing",
      );
    }

    const { error } = await serviceClient.rpc("ar_update_research_project_metadata", {
      p_project_id: projectId,
      p_user_id: userId,
      p_patch: patch,
    });
    if (error) {
      throw mapResearchProjectRpcError(
        error,
        "research_project_update_failed",
        "Failed to update Research Project",
      );
    }

    const detail = await loadResearchProjectDetail(serviceClient, projectId, userId);
    if (!detail) throw new ApiError(404, "research_project_not_found", "Research Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
