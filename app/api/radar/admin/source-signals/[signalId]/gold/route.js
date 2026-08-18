import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../lib/candidates/review-api.mjs";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { ComplaintContractError } from "../../../../../../../lib/sources/complaint-contracts.mjs";
import {
  saveGoldAnnotation,
  SourceComplaintGateError,
} from "../../../../../../../lib/sources/complaint-service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function PUT(request, { params }) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const { signalId } = await params;
    const body = await readObjectBody(request);

    const annotation = await saveGoldAnnotation(serviceClient, {
      signalId,
      curatorUserId: userId,
      input: body,
    });

    return NextResponse.json({ annotation });
  } catch (error) {
    if (error instanceof ComplaintContractError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    if (error instanceof SourceComplaintGateError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
