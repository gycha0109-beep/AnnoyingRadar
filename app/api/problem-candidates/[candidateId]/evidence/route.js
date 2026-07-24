import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { normalizeEvidenceMove } from "../../../../../lib/candidates/review-contracts.mjs";
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
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizeEvidenceMove(body);
    } catch (error) {
      throw new ApiError(400, "invalid_evidence_move", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    await assertCandidateOwner(input.target_candidate_id, userId, serviceClient, "id");

    const { error } = await serviceClient.rpc("ar_move_candidate_evidence", {
      p_source_candidate_id: candidateId,
      p_target_candidate_id: input.target_candidate_id,
      p_evidence_id: input.evidence_id,
      p_user_id: userId,
    });
    if (error) throw mapCandidateReviewRpcError(error, "evidence_move_failed", "Failed to move Evidence");

    const source = await loadCandidateDetail(serviceClient, candidateId, userId);
    const target = await loadCandidateDetail(serviceClient, input.target_candidate_id, userId);
    if (!source || !target) throw new ApiError(404, "candidate_not_found", "Problem Candidate not found");
    return NextResponse.json({ source, target });
  } catch (error) {
    return jsonError(error);
  }
}
