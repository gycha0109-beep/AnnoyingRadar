import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  assessSourceFormationForCurator,
  SourceFormationAssessmentError,
} from "../../../../../../../lib/sources/source-formation-service.mjs";
import { SourceProblemFormationObserverError } from "../../../../../../../lib/sources/source-problem-formation-observer.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  try {
    const serviceClient = createServiceClient();
    await requireRadarCurator(serviceClient);
    const { signalId } = await params;

    const assessment = await assessSourceFormationForCurator(serviceClient, { signalId });
    return NextResponse.json({ assessment });
  } catch (error) {
    if (error instanceof SourceFormationAssessmentError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    if (error instanceof SourceProblemFormationObserverError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
