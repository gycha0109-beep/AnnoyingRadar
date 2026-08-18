import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../lib/auth/require-user.js";
import { normalizePublicProblemListQuery } from "../../../../lib/radar/contracts.mjs";
import { listPublishedPublicProblems } from "../../../../lib/radar/service.mjs";
import { createServerSupabaseClient } from "../../../../lib/supabase/server.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    let query;
    try {
      query = normalizePublicProblemListQuery(new URL(request.url).searchParams);
    } catch (error) {
      throw new ApiError(400, "invalid_public_problem_query", error.message);
    }

    const publicClient = await createServerSupabaseClient();
    const problems = await listPublishedPublicProblems(publicClient, query);
    return NextResponse.json({ problems, query });
  } catch (error) {
    return jsonError(error);
  }
}
