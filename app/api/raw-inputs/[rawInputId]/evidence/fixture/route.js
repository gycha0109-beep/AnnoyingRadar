import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../../lib/auth/require-user.js";
import { buildDeterministicEvidenceFixture } from "../../../../../../lib/evidence/contracts.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

function mapFixtureRpcError(error) {
  console.error(error);
  const message = error?.message ?? "";

  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }

  if (message.includes("Confirmed Candidate exists")) {
    return new ApiError(409, "confirmed_candidate_exists", "Confirmed Candidate blocks fixture replacement");
  }

  if (message.includes("cannot prepare Evidence")) {
    return new ApiError(409, "fixture_not_allowed", "Evidence fixture cannot be prepared in the current status");
  }

  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(400, "invalid_fixture", message || "Invalid Evidence fixture");
  }

  return new ApiError(500, "fixture_prepare_failed", "Failed to prepare Evidence fixture");
}

export async function POST(_request, { params }) {
  try {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_EVIDENCE_FIXTURE !== "true") {
      throw new ApiError(404, "fixture_disabled", "Evidence fixture endpoint is disabled");
    }

    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();
    const rawInput = await assertRawInputOwner(
      rawInputId,
      userId,
      serviceClient,
      "id, raw_text",
    );

    let fixture;
    try {
      fixture = buildDeterministicEvidenceFixture(rawInput.raw_text);
    } catch (error) {
      throw new ApiError(400, "fixture_build_failed", error.message);
    }

    const { data, error } = await serviceClient.rpc("ar_replace_evidence_fixture", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_evidences: fixture,
    });

    if (error) {
      throw mapFixtureRpcError(error);
    }

    return NextResponse.json(
      {
        analysis_status: "reviewing_evidence",
        evidences: data ?? [],
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
