import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../lib/candidates/review-api.mjs";
import { mapRadarRpcError } from "../../../../../../../lib/radar/api.mjs";
import { normalizePublicProblemStatus } from "../../../../../../../lib/radar/contracts.mjs";
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

export async function PATCH(request, { params }) {
  try {
    const publicProblemId = await publicProblemIdFrom(params);
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const body = await readObjectBody(request);

    let status;
    try {
      status = normalizePublicProblemStatus(body.status);
    } catch (error) {
      throw new ApiError(400, "invalid_public_problem_status", error.message);
    }

    const { error } = await serviceClient.rpc("ar_set_public_problem_status", {
      p_problem_id: publicProblemId,
      p_curator_user_id: userId,
      p_status: status,
    });
    if (error) {
      throw mapRadarRpcError(error, "public_problem_status_failed", "Failed to change Public Problem status");
    }

    const detail = await loadAdminPublicProblemDetail(serviceClient, publicProblemId);
    if (!detail) throw new ApiError(404, "public_problem_not_found", "Public Problem not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
