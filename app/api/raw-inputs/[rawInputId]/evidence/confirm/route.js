import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../../lib/auth/require-user.js";
import { normalizeEvidenceDecision } from "../../../../../../lib/evidence/contracts.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Valid JSON body is required");
  }
}

function mapConfirmRpcError(error) {
  console.error(error);
  const message = error?.message ?? "";

  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }

  if (message.includes("reviewing_evidence")) {
    return new ApiError(409, "evidence_confirm_not_allowed", "Evidence can only be confirmed during review");
  }

  if (message.includes("At least one confirmed") || message.includes("classified exactly once")) {
    return new ApiError(409, "incomplete_evidence_decision", message);
  }

  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(400, "invalid_evidence_decision", message || "Invalid Evidence decision");
  }

  return new ApiError(500, "evidence_confirm_failed", "Failed to confirm Evidence review");
}

export async function PATCH(request, { params }) {
  try {
    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const body = await readJson(request);

    let decision;
    try {
      decision = normalizeEvidenceDecision(body);
    } catch (error) {
      throw new ApiError(400, "invalid_evidence_decision", error.message);
    }

    const serviceClient = createServiceClient();
    await assertRawInputOwner(rawInputId, userId, serviceClient, "id");

    const { data, error } = await serviceClient.rpc("ar_confirm_evidence_review", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_confirmed_evidence_ids: decision.confirmed_evidence_ids,
      p_deleted_evidence_ids: decision.deleted_evidence_ids,
    });

    if (error) {
      throw mapConfirmRpcError(error);
    }

    return NextResponse.json({
      analysis_status: "grouping",
      evidences: data ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
