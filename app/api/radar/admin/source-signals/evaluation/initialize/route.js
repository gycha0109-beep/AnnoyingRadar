import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { BlindEvaluationError, initializeBlindEvaluationSet } from "../../../../../../../lib/sources/blind-evaluation.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const evaluation = await initializeBlindEvaluationSet(serviceClient, { curatorUserId: userId });
    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof BlindEvaluationError) return jsonError(new ApiError(error.status, error.code, error.message));
    return jsonError(error);
  }
}
