import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../../lib/auth/require-user.js";
import { mapRadarRpcError } from "../../../../../../../../lib/radar/api.mjs";
import { requireRadarCurator } from "../../../../../../../../lib/radar/curator.js";
import { loadAdminPublicProblemDetail } from "../../../../../../../../lib/radar/service.mjs";
import { createServiceClient } from "../../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function idsFrom(params) {
  const resolved = await params;
  const publicProblemId = resolved.publicProblemId;
  const problemCandidateId = resolved.problemCandidateId;

  if (!UUID_RE.test(publicProblemId ?? "")) {
    throw new ApiError(400, "invalid_public_problem_id", "Invalid Public Problem id");
  }
  if (!UUID_RE.test(problemCandidateId ?? "")) {
    throw new ApiError(400, "invalid_problem_candidate_id", "Invalid Problem Candidate id");
  }

  return { publicProblemId, problemCandidateId };
}

export async function DELETE(_request, { params }) {
  try {
    const { publicProblemId, problemCandidateId } = await idsFrom(params);
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);

    const { error } = await serviceClient.rpc("ar_unlink_public_problem_candidate", {
      p_problem_id: publicProblemId,
      p_problem_candidate_id: problemCandidateId,
      p_curator_user_id: userId,
    });
    if (error) {
      throw mapRadarRpcError(error, "public_problem_lineage_unlink_failed", "Failed to unlink source Problem Card");
    }

    const detail = await loadAdminPublicProblemDetail(serviceClient, publicProblemId);
    if (!detail) throw new ApiError(404, "public_problem_not_found", "Public Problem not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
