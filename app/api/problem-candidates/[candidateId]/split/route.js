import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { normalizeSplitRequest } from "../../../../../lib/candidates/review-contracts.mjs";
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
      input = normalizeSplitRequest(body);
    } catch (error) {
      throw new ApiError(400, "invalid_split_request", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");

    const { data, error } = await serviceClient.rpc("ar_split_problem_candidate", {
      p_source_candidate_id: candidateId,
      p_user_id: userId,
      p_evidence_ids: input.evidence_ids,
      p_new_candidate: input.new_candidate,
    });
    if (error) throw mapCandidateReviewRpcError(error, "candidate_split_failed", "Failed to split Candidate");

    const source = await loadCandidateDetail(serviceClient, candidateId, userId);
    const newCandidateId = (data ?? []).find((candidate) => candidate.id !== candidateId)?.id;
    const created = newCandidateId
      ? await loadCandidateDetail(serviceClient, newCandidateId, userId)
      : null;
    if (!source || !created) {
      throw new ApiError(500, "candidate_split_load_failed", "Candidates were split but could not be loaded");
    }
    return NextResponse.json({ source, created });
  } catch (error) {
    return jsonError(error);
  }
}
