import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../lib/candidates/review-api.mjs";
import { normalizeIdeaCandidatePatch } from "../../../../lib/ideas/contracts.mjs";
import { assertIdeaOwner, mapIdeaReviewRpcError } from "../../../../lib/ideas/review-api.mjs";
import { loadIdeaCandidateDetail } from "../../../../lib/ideas/service.mjs";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function ideaIdFrom(params) {
  const resolved = await params;
  return resolved.ideaId;
}

export async function GET(_request, { params }) {
  try {
    const ideaId = await ideaIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    const detail = await loadIdeaCandidateDetail(serviceClient, ideaId, userId);
    if (!detail) throw new ApiError(404, "idea_not_found", "Idea Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const ideaId = await ideaIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let patch;
    try {
      patch = normalizeIdeaCandidatePatch(body);
    } catch (error) {
      throw new ApiError(400, "invalid_idea_patch", error.message);
    }

    const serviceClient = createServiceClient();
    const current = await assertIdeaOwner(ideaId, userId, serviceClient, "id, status");
    if (current.status === "discarded" || current.status === "archived") {
      throw new ApiError(
        409,
        "idea_read_only",
        "Discarded or archived Idea Candidate must be restored before editing",
      );
    }

    const { error } = await serviceClient.rpc("ar_update_idea_candidate", {
      p_idea_candidate_id: ideaId,
      p_user_id: userId,
      p_patch: patch,
    });
    if (error) {
      throw mapIdeaReviewRpcError(error, "idea_update_failed", "Failed to update Idea Candidate");
    }

    const detail = await loadIdeaCandidateDetail(serviceClient, ideaId, userId);
    if (!detail) throw new ApiError(404, "idea_not_found", "Idea Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}