import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { normalizeMergeRequest } from "../../../../../lib/candidates/review-contracts.mjs";
import {
  mapCandidateReviewRpcError,
  readObjectBody,
} from "../../../../../lib/candidates/review-api.mjs";
import { loadCandidateDetail } from "../../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { candidateId } = await params;
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizeMergeRequest(body);
    } catch (error) {
      throw new ApiError(400, "invalid_merge_request", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    await assertCandidateOwner(input.target_candidate_id, userId, serviceClient, "id");

    const { error } = await serviceClient.rpc("ar_merge_problem_candidates", {
      p_source_candidate_id: candidateId,
      p_target_candidate_id: input.target_candidate_id,
      p_user_id: userId,
    });
    if (error) throw mapCandidateReviewRpcError(error, "candidate_merge_failed", "Failed to merge Candidates");

    const target = await loadCandidateDetail(serviceClient, input.target_candidate_id, userId);
    if (!target) throw new ApiError(404, "candidate_not_found", "Problem Candidate not found");
    return NextResponse.json(target);
  } catch (error) {
    return jsonError(error);
  }
}
