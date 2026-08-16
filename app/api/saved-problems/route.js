import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../lib/auth/require-user.js";
import { normalizeSavedProblemListStatus } from "../../../lib/saved-problems/contracts.mjs";
import { loadSavedProblemOverview } from "../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { userId } = await requireUser();
    let status;
    try {
      status = normalizeSavedProblemListStatus(new URL(request.url).searchParams.get("status") ?? "active");
    } catch (error) {
      throw new ApiError(400, "invalid_saved_problem_status", error.message);
    }

    const serviceClient = createServiceClient();
    const savedProblems = await loadSavedProblemOverview(serviceClient, userId, { status });
    return NextResponse.json({ saved_problems: savedProblems, status });
  } catch (error) {
    return jsonError(error);
  }
}
