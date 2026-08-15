import { NextResponse } from "next/server";

import {
  assertCandidateOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import { loadIdeaCandidatesForProblemCard } from "../../../../../lib/ideas/service.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function getCandidateId(params) {
  const resolvedParams = await params;
  return resolvedParams.candidateId;
}

export async function GET(_request, { params }) {
  try {
    const candidateId = await getCandidateId(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    await assertCandidateOwner(
      candidateId,
      userId,
      serviceClient,
      "id, raw_input_id, status",
    );

    const result = await loadIdeaCandidatesForProblemCard(
      serviceClient,
      candidateId,
      userId,
    );

    return NextResponse.json({
      problem_candidate_id: candidateId,
      ...result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
