import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  buildCuratorIncidentDecisionPacket,
  SourceIncidentDecisionPacketError,
} from "../../../../../../../lib/sources/source-incident-decision-packet-service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const serviceClient = createServiceClient();
    await requireRadarCurator(serviceClient);
    const { signalId } = await params;
    const formationAssessmentId = new URL(request.url).searchParams.get("formationAssessmentId");

    const packet = await buildCuratorIncidentDecisionPacket(serviceClient, {
      signalId,
      formationAssessmentId,
    });
    return NextResponse.json({ packet });
  } catch (error) {
    if (error instanceof SourceIncidentDecisionPacketError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
