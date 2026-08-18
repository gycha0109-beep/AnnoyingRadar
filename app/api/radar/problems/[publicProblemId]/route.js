import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../lib/auth/require-user.js";
import { loadPublishedPublicProblemDetail } from "../../../../../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server.js";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function publicProblemIdFrom(params) {
  const resolved = await params;
  const value = resolved.publicProblemId;
  if (!UUID_RE.test(value ?? "")) {
    throw new ApiError(400, "invalid_public_problem_id", "Invalid Public Problem id");
  }
  return value;
}

export async function GET(_request, { params }) {
  try {
    const publicProblemId = await publicProblemIdFrom(params);
    const publicClient = await createServerSupabaseClient();
    const detail = await loadPublishedPublicProblemDetail(publicClient, publicProblemId);
    if (!detail) throw new ApiError(404, "public_problem_not_found", "Public Problem not found");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
