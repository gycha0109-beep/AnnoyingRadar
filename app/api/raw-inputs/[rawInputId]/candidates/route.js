import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import {
  groupingMetadata,
  loadCandidateReview,
} from "../../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const RAW_INPUT_GROUPING_STATE_SELECT = [
  "id",
  "analysis_status",
  "grouping_model",
  "grouping_prompt_version",
  "grouping_provider_request_id",
  "grouping_error_code",
  "grouping_started_at",
  "grouping_completed_at",
  "grouping_input_tokens",
  "grouping_output_tokens",
].join(", ");

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

export async function GET(_request, { params }) {
  try {
    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    const rawInput = await assertRawInputOwner(
      rawInputId,
      userId,
      serviceClient,
      RAW_INPUT_GROUPING_STATE_SELECT,
    );

    let candidates;
    try {
      candidates = await loadCandidateReview(serviceClient, rawInputId, userId);
    } catch (error) {
      console.error(error);
      throw new ApiError(500, "candidate_list_failed", "Failed to load Problem Candidates");
    }

    return NextResponse.json({
      analysis_status: rawInput.analysis_status,
      grouping: groupingMetadata(rawInput),
      candidates,
    });
  } catch (error) {
    return jsonError(error);
  }
}
