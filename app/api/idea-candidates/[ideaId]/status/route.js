import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import {
  assertIdeaOwner,
  mapIdeaReviewRpcError,
  normalizeIdeaStatusRequest,
} from "../../../../../lib/ideas/review-api.mjs";
import { loadIdeaCandidateDetail } from "../../../../../lib/ideas/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function ideaIdFrom(params) {
  const resolved = await params;
  return resolved.ideaId;
}

export async function PATCH(request, { params }) {
  try {
    const ideaId = await ideaIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);
    const serviceClient = createServiceClient();
    const current = await assertIdeaOwner(ideaId, userId, serviceClient, "id, status");

    let targetStatus;
    try {
      targetStatus = normalizeIdeaStatusRequest(body, current.status);
    } catch (error) {
      const message = String(error?.message ?? "Invalid Idea Candidate status request");
      if (message.startsWith("Invalid Idea Candidate status transition")) {
        throw new ApiError(409, "invalid_idea_status_transition", message);
      }
      throw new ApiError(400, "invalid_idea_status", message);
    }

    const { error } = await serviceClient.rpc("ar_set_idea_candidate_status", {
      p_idea_candidate_id: ideaId,
      p_user_id: userId,
      p_target_status: targetStatus,
    });
    if (error) {
      throw mapIdeaReviewRpcError(
        error,
        "idea_status_update_failed",
        "Failed to update Idea Candidate status",
      );
    }

    const detail = await loadIdeaCandidateDetail(serviceClient, ideaId, userId);
    if (!detail) throw new ApiError(404, "idea_not_found", "Idea Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}