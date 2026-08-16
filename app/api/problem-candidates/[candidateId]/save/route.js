import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import {
  normalizeSavedProblemPatch,
  savedProblemEligibility,
} from "../../../../../lib/saved-problems/contracts.mjs";
import { mapSavedProblemRpcError } from "../../../../../lib/saved-problems/review-api.mjs";
import { loadSavedProblemByCandidate } from "../../../../../lib/saved-problems/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function candidateIdFrom(params) {
  const resolved = await params;
  return resolved.candidateId;
}

async function loadSource(serviceClient, candidateId, userId) {
  const candidate = await assertCandidateOwner(
    candidateId,
    userId,
    serviceClient,
    "id, raw_input_id, status, evidence_count",
  );
  const rawInput = await assertRawInputOwner(
    candidate.raw_input_id,
    userId,
    serviceClient,
    "id, analysis_status",
  );
  return { candidate, rawInput };
}

export async function GET(_request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const { candidate, rawInput } = await loadSource(serviceClient, candidateId, userId);
    const savedProblem = await loadSavedProblemByCandidate(serviceClient, candidateId, userId);

    return NextResponse.json({
      problem_candidate_id: candidateId,
      saved_problem: savedProblem,
      eligibility: savedProblemEligibility(candidate, rawInput),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(_request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const { candidate, rawInput } = await loadSource(serviceClient, candidateId, userId);
    const eligibility = savedProblemEligibility(candidate, rawInput);
    if (!eligibility.eligible) {
      throw new ApiError(409, eligibility.reason, "Only a confirmed Problem Card from a completed analysis can be saved");
    }

    const { error } = await serviceClient.rpc("ar_save_problem_card", {
      p_problem_candidate_id: candidateId,
      p_user_id: userId,
    });
    if (error) {
      throw mapSavedProblemRpcError(error, "saved_problem_create_failed", "Failed to save Problem Card");
    }

    const savedProblem = await loadSavedProblemByCandidate(serviceClient, candidateId, userId);
    if (!savedProblem) throw new ApiError(500, "saved_problem_create_failed", "Saved Problem was not persisted");
    return NextResponse.json({ saved_problem: savedProblem });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let patch;
    try {
      patch = normalizeSavedProblemPatch(body);
    } catch (error) {
      throw new ApiError(400, "invalid_saved_problem_patch", error.message);
    }

    const serviceClient = createServiceClient();
    await assertCandidateOwner(candidateId, userId, serviceClient, "id");
    const { error } = await serviceClient.rpc("ar_update_saved_problem_metadata", {
      p_problem_candidate_id: candidateId,
      p_user_id: userId,
      p_patch: patch,
    });
    if (error) {
      throw mapSavedProblemRpcError(error, "saved_problem_update_failed", "Failed to update Saved Problem");
    }

    const savedProblem = await loadSavedProblemByCandidate(serviceClient, candidateId, userId);
    if (!savedProblem) throw new ApiError(404, "saved_problem_not_found", "Saved Problem not found");
    return NextResponse.json({ saved_problem: savedProblem });
  } catch (error) {
    return jsonError(error);
  }
}
