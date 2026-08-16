import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../lib/candidates/review-api.mjs";
import {
  normalizeResearchProjectCreate,
  normalizeResearchProjectListStatus,
} from "../../../lib/research-projects/contracts.mjs";
import { mapResearchProjectRpcError } from "../../../lib/research-projects/review-api.mjs";
import {
  loadResearchProjectDetail,
  loadResearchProjectOverview,
} from "../../../lib/research-projects/service.mjs";
import { loadSavedProblemByCandidate } from "../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { userId } = await requireUser();
    let status;
    try {
      status = normalizeResearchProjectListStatus(
        new URL(request.url).searchParams.get("status") ?? "active",
      );
    } catch (error) {
      throw new ApiError(400, "invalid_research_project_status", error.message);
    }

    const serviceClient = createServiceClient();
    const projects = await loadResearchProjectOverview(serviceClient, userId, { status });
    return NextResponse.json({ research_projects: projects, status });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireUser();
    const body = await readObjectBody(request);
    let input;
    try {
      input = normalizeResearchProjectCreate(body);
    } catch (error) {
      throw new ApiError(400, "invalid_research_project_create", error.message);
    }

    const serviceClient = createServiceClient();
    let rpcName = "ar_create_research_project";
    let rpcArgs = {
      p_user_id: userId,
      p_title: input.title,
      p_purpose: input.purpose,
    };

    if (input.initial_problem_candidate_id) {
      const candidate = await assertCandidateOwner(
        input.initial_problem_candidate_id,
        userId,
        serviceClient,
        "id, status",
      );
      if (candidate.status !== "confirmed") {
        throw new ApiError(
          409,
          "confirmed_problem_card_required",
          "Research Project Problem link requires a confirmed Problem Card",
        );
      }
      const savedProblem = await loadSavedProblemByCandidate(
        serviceClient,
        input.initial_problem_candidate_id,
        userId,
      );
      if (!savedProblem) {
        throw new ApiError(409, "saved_problem_required", "Save the Problem Card before linking it to a Research Project");
      }
      if (savedProblem.status !== "active") {
        throw new ApiError(409, "active_saved_problem_required", "Restore the Saved Problem before linking it to a Research Project");
      }
      rpcName = "ar_create_research_project_with_problem";
      rpcArgs = {
        ...rpcArgs,
        p_problem_candidate_id: input.initial_problem_candidate_id,
      };
    }

    const { data, error } = await serviceClient.rpc(rpcName, rpcArgs);
    if (error) {
      throw mapResearchProjectRpcError(
        error,
        "research_project_create_failed",
        "Failed to create Research Project",
      );
    }

    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.id) {
      throw new ApiError(500, "research_project_create_failed", "Research Project was not persisted");
    }
    const detail = await loadResearchProjectDetail(serviceClient, created.id, userId);
    if (!detail) throw new ApiError(500, "research_project_create_failed", "Research Project was not persisted");
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
