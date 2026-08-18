import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../lib/candidates/review-api.mjs";
import { mapRadarRpcError, unwrapRpcRow } from "../../../../../../../lib/radar/api.mjs";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { loadAdminPublicProblemDetail } from "../../../../../../../lib/radar/service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function publicProblemIdFrom(params) {
  const resolved = await params;
  const value = resolved.publicProblemId;
  if (!UUID_RE.test(value ?? "")) throw new ApiError(400, "invalid_public_problem_id", "Invalid Public Problem id");
  return value;
}

export async function POST(request, { params }) {
  try {
    const publicProblemId = await publicProblemIdFrom(params);
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const body = await readObjectBody(request);
    const problemCandidateId = body.problem_candidate_id;

    if (!UUID_RE.test(problemCandidateId ?? "")) {
      throw new ApiError(400, "invalid_problem_candidate_id", "Invalid Problem Candidate id");
    }

    const { data, error } = await serviceClient.rpc("ar_link_public_problem_candidate", {
      p_problem_id: publicProblemId,
      p_problem_candidate_id: problemCandidateId,
      p_curator_user_id: userId,
    });
    if (error) {
      throw mapRadarRpcError(error, "public_problem_lineage_link_failed", "Failed to link source Problem Card");
    }

    const linked = unwrapRpcRow(data);
    if (!linked?.id) {
      throw new ApiError(500, "public_problem_lineage_link_failed", "Publication lineage was not persisted");
    }

    const detail = await loadAdminPublicProblemDetail(serviceClient, publicProblemId);
    if (!detail) throw new ApiError(404, "public_problem_not_found", "Public Problem not found");
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
