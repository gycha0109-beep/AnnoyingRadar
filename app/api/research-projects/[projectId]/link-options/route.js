import { NextResponse } from "next/server";

import { jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { loadIdeaOverview } from "../../../../../lib/ideas/service.mjs";
import { assertResearchProjectOwner } from "../../../../../lib/research-projects/review-api.mjs";
import { loadSavedProblemOverview } from "../../../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function projectIdFrom(params) {
  const resolved = await params;
  return resolved.projectId;
}

export async function GET(_request, { params }) {
  try {
    const projectId = await projectIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const project = await assertResearchProjectOwner(projectId, userId, serviceClient, "id, status");

    if (project.status !== "active") {
      return NextResponse.json({ active_saved_problems: [], ideas: [] });
    }

    const [savedProblems, ideas] = await Promise.all([
      loadSavedProblemOverview(serviceClient, userId, { status: "active" }),
      loadIdeaOverview(serviceClient, userId),
    ]);

    return NextResponse.json({ active_saved_problems: savedProblems, ideas });
  } catch (error) {
    return jsonError(error);
  }
}
