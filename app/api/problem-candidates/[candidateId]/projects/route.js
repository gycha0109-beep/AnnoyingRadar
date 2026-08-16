import { NextResponse } from "next/server";

import { assertCandidateOwner, jsonError, requireUser } from "../../../../../lib/auth/require-user.js";
import { loadProjectsForProblem, loadResearchProjectOverview } from "../../../../../lib/research-projects/service.mjs";
import { loadSavedProblemByCandidate } from "../../../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function candidateIdFrom(params) {
  const resolved = await params;
  return resolved.candidateId;
}

export async function GET(_request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id, status");

    const [memberships, activeProjects, savedProblem] = await Promise.all([
      loadProjectsForProblem(serviceClient, candidateId, userId),
      loadResearchProjectOverview(serviceClient, userId, { status: "active" }),
      loadSavedProblemByCandidate(serviceClient, candidateId, userId),
    ]);

    return NextResponse.json({
      problem_candidate_id: candidateId,
      saved_problem: savedProblem,
      memberships,
      active_projects: activeProjects,
    });
  } catch (error) {
    return jsonError(error);
  }
}
