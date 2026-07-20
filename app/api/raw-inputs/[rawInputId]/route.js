import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  hasConfirmedRawInputCandidate,
  jsonError,
  requireUser,
} from "../../../../lib/auth/require-user.js";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const MAX_RAW_TEXT_LENGTH = 200000;
const RAW_INPUT_SELECT =
  "id, user_id, raw_text, source_type, source_url, source_memo, language, analysis_status, content_hash, created_at, updated_at";
const PATCH_FIELDS = new Set([
  "raw_text",
  "source_type",
  "source_url",
  "source_memo",
  "language",
]);
const RAW_TEXT_MUTABLE_STATUSES = new Set([
  "input_saved",
  "extraction_failed",
  "reviewing_evidence",
  "grouping_failed",
  "reviewing_candidates",
]);

function contentHash(rawText) {
  return createHash("sha256").update(rawText, "utf8").digest("hex");
}

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json", "JSON object body is required");
  }
}

async function readJson(request) {
  try {
    const body = await request.json();
    assertObject(body);
    return body;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(400, "invalid_json", "Valid JSON body is required");
  }
}

function validatePatchFields(body) {
  const fieldNames = Object.keys(body);
  const unknownField = fieldNames.find((fieldName) => !PATCH_FIELDS.has(fieldName));

  if (unknownField) {
    throw new ApiError(
      400,
      "unknown_field",
      `${unknownField} cannot be updated by this API`,
    );
  }

  if (fieldNames.length === 0) {
    throw new ApiError(
      400,
      "empty_patch",
      "At least one updatable field is required",
    );
  }
}

function optionalString(body, fieldName) {
  if (!(fieldName in body) || body[fieldName] === undefined) {
    return undefined;
  }

  if (body[fieldName] === null || typeof body[fieldName] === "string") {
    return body[fieldName];
  }

  throw new ApiError(
    400,
    "invalid_field",
    `${fieldName} must be a string or null`,
  );
}

function assignOptionalString(target, body, fieldName) {
  const value = optionalString(body, fieldName);

  if (value !== undefined) {
    target[fieldName] = value;
  }
}

function nextFieldValue(body, currentRawInput, fieldName) {
  return fieldName in body ? body[fieldName] : currentRawInput[fieldName];
}

function optionalRawText(body) {
  if (!("raw_text" in body) || body.raw_text === undefined) {
    return undefined;
  }

  if (typeof body.raw_text !== "string" || body.raw_text.trim().length === 0) {
    throw new ApiError(400, "raw_text_required", "raw_text is required");
  }

  if (body.raw_text.length > MAX_RAW_TEXT_LENGTH) {
    throw new ApiError(413, "raw_text_too_large", "raw_text is too large");
  }

  return body.raw_text;
}

function mapRawTextUpdateRpcError(error) {
  console.error(error);

  const message = error?.message ?? "";

  if (message.includes("confirmed candidate exists")) {
    return new ApiError(
      409,
      "confirmed_candidate_exists",
      "raw_text cannot be updated after a candidate is confirmed",
    );
  }

  if (message.includes("invalid analysis_status")) {
    return new ApiError(
      409,
      "raw_text_update_not_allowed",
      "raw_text cannot be updated in the current analysis status",
    );
  }

  if (message.includes("not found or not owned")) {
    return new ApiError(404, "raw_input_not_found", "Raw input not found");
  }

  if (message.includes("p_raw_text is required")) {
    return new ApiError(400, "raw_text_required", "raw_text is required");
  }

  return new ApiError(500, "raw_input_update_failed", "Failed to update raw input");
}

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
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
      RAW_INPUT_SELECT,
    );

    return NextResponse.json({ raw_input: rawInput });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const rawInputId = await getRawInputId(params);
    const { userId } = await requireUser();
    const body = await readJson(request);
    validatePatchFields(body);

    const serviceClient = createServiceClient();
    const currentRawInput = await assertRawInputOwner(
      rawInputId,
      userId,
      serviceClient,
      RAW_INPUT_SELECT,
    );

    const updatePayload = {};
    assignOptionalString(updatePayload, body, "source_type");
    assignOptionalString(updatePayload, body, "source_url");
    assignOptionalString(updatePayload, body, "source_memo");
    assignOptionalString(updatePayload, body, "language");

    const nextRawText = optionalRawText(body);
    const rawTextChanged =
      nextRawText !== undefined && nextRawText !== currentRawInput.raw_text;

    if (rawTextChanged) {
      const hasConfirmedCandidate = await hasConfirmedRawInputCandidate(
        rawInputId,
        userId,
        serviceClient,
      );

      if (hasConfirmedCandidate) {
        throw new ApiError(
          409,
          "confirmed_candidate_exists",
          "raw_text cannot be updated after a candidate is confirmed",
        );
      }

      if (!RAW_TEXT_MUTABLE_STATUSES.has(currentRawInput.analysis_status)) {
        throw new ApiError(
          409,
          "raw_text_update_not_allowed",
          "raw_text cannot be updated in the current analysis status",
        );
      }

      const { data, error } = await serviceClient
        .rpc("ar_update_raw_input_text", {
          p_raw_input_id: rawInputId,
          p_user_id: userId,
          p_raw_text: nextRawText,
          p_content_hash: contentHash(nextRawText),
          p_source_type: nextFieldValue(body, currentRawInput, "source_type"),
          p_source_url: nextFieldValue(body, currentRawInput, "source_url"),
          p_source_memo: nextFieldValue(body, currentRawInput, "source_memo"),
          p_language: nextFieldValue(body, currentRawInput, "language"),
        })
        .single();

      if (error) {
        throw mapRawTextUpdateRpcError(error);
      }

      return NextResponse.json({ raw_input: data });
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ raw_input: currentRawInput });
    }

    const { data, error } = await serviceClient
      .from("ar_raw_inputs")
      .update(updatePayload)
      .eq("id", rawInputId)
      .eq("user_id", userId)
      .select(RAW_INPUT_SELECT)
      .single();

    if (error) {
      console.error(error);
      throw new ApiError(500, "raw_input_update_failed", "Failed to update raw input");
    }

    return NextResponse.json({ raw_input: data });
  } catch (error) {
    return jsonError(error);
  }
}
