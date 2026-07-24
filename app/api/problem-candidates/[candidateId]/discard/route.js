import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { normalizeDiscardRequest } from "../../../../../lib/candidates/review-contracts.mjs";
import {
  mapCandidateReviewRpcError,
  readObjectBody,
} from "../../../../../lib/candidates/review-api.mjs";
import { loadCandidateDetail } from "../../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    const { candidateId } = await params;
    const { userId } = await requireUser();
    const body = await readObjectBody(request, { allowEmpty: true });

    let input;
    try {
      input = normalizeDiscardRequest(body);
    } catch (error) {
      throw new ApiError(400, "invalid_discard_request", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    const { error } = await serviceClient.rpc("ar_set_problem_candidate_status", {
      p_candidate_id: candidateId,
      p_user_id: userId,
      p_target_status: "discarded",
      p_discard_reason: input.discard_reason,
    });
    if (error) throw mapCandidateReviewRpcError(error, "candidate_discard_failed", "Failed to discard Candidate");

    const detail = await loadCandidateDetail(serviceClient, candidateId, userId);
    if (!detail) throw new ApiError(404, "candidate_not_found", "Problem Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
