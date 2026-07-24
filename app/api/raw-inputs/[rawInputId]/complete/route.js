import { NextResponse } from "next/server";

import {
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { mapCandidateReviewRpcError } from "../../../../../lib/candidates/review-api.mjs";
import { loadCandidateReview } from "../../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function PATCH(_request, { params }) {
  try {
    const { rawInputId } = await params;
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    await assertRawInputOwner(rawInputId, userId, serviceClient, "id");

    const { data, error } = await serviceClient.rpc("ar_complete_candidate_review", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
    });
    if (error) throw mapCandidateReviewRpcError(error, "candidate_review_complete_failed", "Failed to complete Candidate review");

    const candidates = await loadCandidateReview(
      serviceClient,
      rawInputId,
      userId,
      { includeDiscarded: true },
    );
    return NextResponse.json({
      analysis_status: data?.analysis_status ?? "completed",
      candidates,
    });
  } catch (error) {
    return jsonError(error);
  }
}
