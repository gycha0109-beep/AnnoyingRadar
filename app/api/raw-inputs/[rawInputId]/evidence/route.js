import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import {
  EVIDENCE_SELECT,
  normalizeEvidenceUpdates,
} from "../../../../../lib/evidence/contracts.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("invalid object");
    }
    return body;
  } catch {
    throw new ApiError(400, "invalid_json", "Valid JSON object body is required");
  }
}

function mapEvidenceRpcError(error, fallbackCode, fallbackMessage) {
  console.error(error);
  const message = error?.message ?? "";

  if (message.includes("Raw input not found") || message.includes("Evidence not found")) {
    return new ApiError(404, "evidence_not_found", "Raw Input or Evidence not found");
  }

  if (message.includes("reviewing_evidence")) {
    return new ApiError(409, "evidence_review_not_allowed", "Evidence can only be edited during review");
  }

  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(400, "invalid_evidence_update", message || "Invalid Evidence update");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}

export async function GET(_request, { params }) {
  try {
    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    const rawInput = await assertRawInputOwner(
      rawInputId,
      userId,
      serviceClient,
      "id, analysis_status",
    );

    const { data, error } = await serviceClient
      .from("ar_pain_evidences")
      .select(EVIDENCE_SELECT)
      .eq("raw_input_id", rawInputId)
      .eq("user_id", userId)
      .neq("status", "deleted")
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      throw new ApiError(500, "evidence_list_failed", "Failed to load Evidence");
    }

    return NextResponse.json({
      analysis_status: rawInput.analysis_status,
      evidences: data ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const body = await readJson(request);

    let updates;
    try {
      updates = normalizeEvidenceUpdates(body.updates);
    } catch (error) {
      throw new ApiError(400, "invalid_evidence_update", error.message);
    }

    const serviceClient = createServiceClient();
    await assertRawInputOwner(rawInputId, userId, serviceClient, "id");

    const { data, error } = await serviceClient.rpc("ar_update_evidence_batch", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_updates: updates,
    });

    if (error) {
      throw mapEvidenceRpcError(
        error,
        "evidence_update_failed",
        "Failed to update Evidence",
      );
    }

    return NextResponse.json({ evidences: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
