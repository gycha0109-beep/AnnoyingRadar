import { NextResponse } from "next/server";

import {
  ApiError,
  assertCandidateOwner,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../lib/candidates/review-api.mjs";
import { normalizeProblemAlternativeCreate } from "../../../../../lib/problem-alternatives/contracts.mjs";
import { mapProblemAlternativeRpcError } from "../../../../../lib/problem-alternatives/review-api.mjs";
import { loadProblemAlternativeNotes } from "../../../../../lib/problem-alternatives/service.mjs";
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
    "id, raw_input_id, status",
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

    let notes;
    try {
      notes = await loadProblemAlternativeNotes(serviceClient, candidateId, userId);
    } catch (error) {
      console.error(error);
      throw new ApiError(500, "problem_alternative_read_failed", "Failed to load Problem alternatives");
    }

    return NextResponse.json({
      problem_candidate_id: candidateId,
      notes,
      eligibility: {
        eligible: candidate.status === "confirmed" && rawInput.analysis_status === "completed",
        candidate_status: candidate.status,
        analysis_status: rawInput.analysis_status,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request, { params }) {
  try {
    const candidateId = await candidateIdFrom(params);
    const { userId } = await requireUser();
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizeProblemAlternativeCreate(body);
    } catch (error) {
      throw new ApiError(400, "invalid_problem_alternative_request", error.message);
    }

    const serviceClient = createServiceClient();
    const { candidate, rawInput } = await loadSource(serviceClient, candidateId, userId);
    if (candidate.status !== "confirmed" || rawInput.analysis_status !== "completed") {
      throw new ApiError(
        409,
        "problem_alternative_ineligible",
        "Only a confirmed Problem Card from a completed analysis can receive alternatives",
      );
    }

    const { data, error } = await serviceClient.rpc("ar_create_problem_alternative_note", {
      p_problem_candidate_id: candidateId,
      p_user_id: userId,
      p_kind: input.kind,
      p_name: input.name,
      p_url: input.url,
      p_note: input.note,
    });
    if (error) {
      throw mapProblemAlternativeRpcError(
        error,
        "problem_alternative_create_failed",
        "Failed to create Problem alternative note",
      );
    }
    if (!data) throw new ApiError(500, "problem_alternative_create_failed", "Problem alternative was not persisted");

    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
