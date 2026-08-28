import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  recordCuratorIncidentDecision,
  SourceIncidentCuratorDecisionError,
} from "../../../../../../../lib/sources/source-incident-curator-decision-service.mjs";
import { SourceIncidentDecisionPacketError } from "../../../../../../../lib/sources/source-incident-decision-packet-service.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const { signalId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
    }

    const decision = await recordCuratorIncidentDecision(serviceClient, {
      signalId,
      formationAssessmentId: body?.formationAssessmentId,
      curatorUserId: userId,
      decision: {
        evidenceDecision: body?.evidenceDecision,
        incidentAction: body?.incidentAction,
        existingIncidentId: body?.existingIncidentId,
        newIncidentKey: body?.newIncidentKey,
        newIncidentLabel: body?.newIncidentLabel,
        decisionReason: body?.decisionReason,
      },
    });

    return NextResponse.json({ decision }, { status: 201 });
  } catch (error) {
    if (error instanceof SourceIncidentCuratorDecisionError || error instanceof SourceIncidentDecisionPacketError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
