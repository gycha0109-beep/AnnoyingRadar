import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { ComplaintClassifierError } from "../../../../../../../lib/sources/complaint-classifier.mjs";
import {
  classifySourceSignal,
  SourceComplaintGateError,
} from "../../../../../../../lib/sources/complaint-service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const { signalId } = await params;

    const classification = await classifySourceSignal(serviceClient, {
      signalId,
      curatorUserId: userId,
    });

    return NextResponse.json({ classification });
  } catch (error) {
    if (error instanceof ComplaintClassifierError) {
      return jsonError(new ApiError(error.httpStatus, error.code, error.message));
    }
    if (error instanceof SourceComplaintGateError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
