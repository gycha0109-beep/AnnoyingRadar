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

const RAW_INPUT_EVIDENCE_STATE_SELECT = [
  "id",
  "analysis_status",
  "extraction_model",
  "extraction_prompt_version",
  "extraction_provider_request_id",
  "extraction_error_code",
  "extraction_started_at",
  "extraction_completed_at",
  "extraction_input_tokens",
  "extraction_output_tokens",
].join(", ");

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

function extractionMetadata(rawInput) {
  return {
    model: rawInput.extraction_model ?? null,
    prompt_version: rawInput.extraction_prompt_version ?? null,
    provider_request_id: rawInput.extraction_provider_request_id ?? null,
    error_code: rawInput.extraction_error_code ?? null,
    started_at: rawInput.extraction_started_at ?? null,
    completed_at: rawInput.extraction_completed_at ?? null,
    usage: {
      input_tokens: rawInput.extraction_input_tokens ?? null,
      output_tokens: rawInput.extraction_output_tokens ?? null,
    },
  };
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
      RAW_INPUT_EVIDENCE_STATE_SELECT,
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
      extraction: extractionMetadata(rawInput),
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
