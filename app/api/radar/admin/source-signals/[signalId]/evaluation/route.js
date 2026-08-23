import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { BlindEvaluationError, saveBlindHumanEvaluation } from "../../../../../../../lib/sources/blind-evaluation.mjs";
import { SemanticContractError } from "../../../../../../../lib/sources/semantic-contracts.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function PUT(request, { params }) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const { signalId } = await params;
    const body = await request.json();
    const evaluation = await saveBlindHumanEvaluation(serviceClient, {
      signalId,
      curatorUserId: userId,
      input: body,
    });
    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof BlindEvaluationError || error instanceof SemanticContractError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
