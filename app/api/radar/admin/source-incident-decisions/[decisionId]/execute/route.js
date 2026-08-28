import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  executeApprovedIncidentDecision,
  SourceIncidentDecisionExecutionError,
} from "../../../../../../../lib/sources/source-incident-decision-execution-service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const { decisionId } = await params;

    const execution = await executeApprovedIncidentDecision(serviceClient, {
      decisionId,
      curatorUserId: userId,
    });

    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    if (error instanceof SourceIncidentDecisionExecutionError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
