import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../lib/auth/require-user.js";
import { createServiceClient } from "../../../lib/supabase/service.js";

export const runtime = "nodejs";

const MAX_RAW_TEXT_LENGTH = 200000;
const RAW_INPUT_CREATE_SELECT = "id, analysis_status";

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

function requireRawText(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "raw_text_required", "raw_text is required");
  }

  if (value.length > MAX_RAW_TEXT_LENGTH) {
    throw new ApiError(413, "raw_text_too_large", "raw_text is too large");
  }

  return value;
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

export async function POST(request) {
  try {
    const { userId } = await requireUser();
    const body = await readJson(request);
    const rawText = requireRawText(body.raw_text);

    const insertPayload = {
      user_id: userId,
      raw_text: rawText,
      analysis_status: "input_saved",
      content_hash: contentHash(rawText),
    };

    assignOptionalString(insertPayload, body, "source_type");
    assignOptionalString(insertPayload, body, "source_url");
    assignOptionalString(insertPayload, body, "source_memo");
    assignOptionalString(insertPayload, body, "language");

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("ar_raw_inputs")
      .insert(insertPayload)
      .select(RAW_INPUT_CREATE_SELECT)
      .single();

    if (error) {
      console.error(error);
      throw new ApiError(500, "raw_input_create_failed", "Failed to save raw input");
    }

    return NextResponse.json(
      {
        raw_input_id: data.id,
        analysis_status: data.analysis_status,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
