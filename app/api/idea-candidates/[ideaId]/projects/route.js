import { NextResponse } from "next/server";

import { jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { assertIdeaOwner } from "../../../../../lib/ideas/review-api.mjs";
import { loadProjectsForIdea, loadResearchProjectOverview } from "../../../../../lib/research-projects/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function ideaIdFrom(params) {
  const resolved = await params;
  return resolved.ideaId;
}

export async function GET(_request, { params }) {
  try {
    const ideaId = await ideaIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    await assertIdeaOwner(ideaId, userId, serviceClient, "id");

    const [memberships, activeProjects] = await Promise.all([
      loadProjectsForIdea(serviceClient, ideaId, userId),
      loadResearchProjectOverview(serviceClient, userId, { status: "active" }),
    ]);

    return NextResponse.json({
      idea_candidate_id: ideaId,
      memberships,
      active_projects: activeProjects,
    });
  } catch (error) {
    return jsonError(error);
  }
}
