import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import { mapRadarRpcError, unwrapRpcRow } from "../../../../../lib/radar/api.mjs";
import {
  normalizePublicProblemCreate,
  normalizePublicProblemStatus,
} from "../../../../../lib/radar/contracts.mjs";
import { requireRadarCurator } from "../../../../../lib/radar/curator.js";
import {
  listAdminPublicProblems,
  loadAdminPublicProblemDetail,
} from "../../../../../lib/radar/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const serviceClient = createServiceClient();
    await requireRadarCurator(serviceClient);

    const rawStatus = new URL(request.url).searchParams.get("status");
    let status = null;
    if (rawStatus) {
      try {
        status = normalizePublicProblemStatus(rawStatus);
      } catch (error) {
        throw new ApiError(400, "invalid_public_problem_status", error.message);
      }
    }

    const problems = await listAdminPublicProblems(serviceClient, { status });
    return NextResponse.json({ problems, status });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizePublicProblemCreate(body);
    } catch (error) {
      throw new ApiError(400, "invalid_public_problem_create", error.message);
    }

    const { data, error } = await serviceClient.rpc("ar_create_public_problem", {
      p_curator_user_id: userId,
      p_title: input.title,
      p_summary: input.summary,
      p_target_user: input.target_user,
      p_situation: input.situation,
      p_category: input.category,
    });
    if (error) {
      throw mapRadarRpcError(error, "public_problem_create_failed", "Failed to create Public Problem");
    }

    const created = unwrapRpcRow(data);
    if (!created?.id) throw new ApiError(500, "public_problem_create_failed", "Public Problem was not persisted");
    const detail = await loadAdminPublicProblemDetail(serviceClient, created.id);
    if (!detail) throw new ApiError(500, "public_problem_create_failed", "Public Problem was not persisted");
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
