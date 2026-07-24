import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../lib/auth/require-user.js";
import { normalizeCandidatePatch } from "../../../../lib/candidates/review-contracts.mjs";
import {
  mapCandidateReviewRpcError,
  readObjectBody,
} from "../../../../lib/candidates/review-api.mjs";
import { loadCandidateDetail } from "../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function candidateIdFrom(params) {
  const resolved = await params;
  return resolved.candidateId;
}

export async function GET(_request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");

    const detail = await loadCandidateDetail(serviceClient, candidateId, userId);
    if (!detail) throw new ApiError(404, "candidate_not_found", "Problem Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let patch;
    try {
      patch = normalizeCandidatePatch(body);
    } catch (error) {
      throw new ApiError(400, "invalid_candidate_patch", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    const { error } = await serviceClient.rpc("ar_update_problem_candidate", {
      p_candidate_id: candidateId,
      p_user_id: userId,
      p_patch: patch,
    });
    if (error) throw mapCandidateReviewRpcError(error, "candidate_update_failed", "Failed to update Candidate");

    const detail = await loadCandidateDetail(serviceClient, candidateId, userId);
    if (!detail) throw new ApiError(404, "candidate_not_found", "Problem Candidate not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
