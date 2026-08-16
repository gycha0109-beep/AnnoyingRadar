import { NextResponse } from "next/server";

import { ApiError, assertCandidateOwner, jsonError, requireUser } from "../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../lib/candidates/review-api.mjs";
import { normalizeSavedProblemStatusRequest } from "../../../../../../lib/saved-problems/contracts.mjs";
import { mapSavedProblemRpcError } from "../../../../../../lib/saved-problems/review-api.mjs";
import { loadSavedProblemByCandidate } from "../../../../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function candidateIdFrom(params) {
  const resolved = await params;
  return resolved.candidateId;
}

export async function PATCH(request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);
    const serviceClient = createServiceClient();

    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    const current = await loadSavedProblemByCandidate(serviceClient, candidateId, userId);
    if (!current) throw new ApiError(404, "saved_problem_not_found", "Saved Problem not found");

    let targetStatus;
    try {
      targetStatus = normalizeSavedProblemStatusRequest(body, current.status);
    } catch (error) {
      const message = String(error?.message ?? "Invalid Saved Problem status request");
      if (message.includes("must change status")) {
        throw new ApiError(409, "invalid_saved_problem_status_transition", message);
      }
      throw new ApiError(400, "invalid_saved_problem_status", message);
    }

    const { error } = await serviceClient.rpc("ar_set_saved_problem_status", {
      p_problem_candidate_id: candidateId,
      p_user_id: userId,
      p_target_status: targetStatus,
    });
    if (error) {
      throw mapSavedProblemRpcError(error, "saved_problem_status_update_failed", "Failed to update Saved Problem status");
    }

    const savedProblem = await loadSavedProblemByCandidate(serviceClient, candidateId, userId);
    if (!savedProblem) throw new ApiError(404, "saved_problem_not_found", "Saved Problem not found");
    return NextResponse.json({ saved_problem: savedProblem });
  } catch (error) {
    return jsonError(error);
  }
}
