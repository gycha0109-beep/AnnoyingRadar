import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../lib/auth/require-user.js";
import {
  EVIDENCE_PROMPT_VERSION,
  EvidenceProviderError,
  extractPainEvidence,
  getEvidenceProviderConfig,
} from "../../../../../lib/evidence/openai-extractor.mjs";
import { createServiceClient } from "../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const maxDuration = 90;

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

async function readJson(request) {
  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) return {};
    const body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("invalid object");
    }
    return body;
  } catch {
    throw new ApiError(400, "invalid_json", "Valid JSON object body is required");
  }
}

function normalizeForce(value) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_force", "force must be a boolean");
  }
  return value;
}

function mapBeginError(error) {
  console.error(error);
  const message = error?.message ?? "";

  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }
  if (message.includes("Confirmed Candidate exists")) {
    return new ApiError(409, "confirmed_candidate_exists", "Confirmed Candidate blocks extraction");
  }
  if (message.includes("already in progress")) {
    return new ApiError(409, "extraction_in_progress", "Evidence extraction is already in progress");
  }
  if (message.includes("not allowed from status")) {
    return new ApiError(409, "extraction_not_allowed", "Evidence extraction is not allowed in the current status");
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(400, "invalid_extraction_request", message || "Invalid extraction request");
  }
  return new ApiError(500, "extraction_begin_failed", "Failed to begin Evidence extraction");
}

function mapCompletionError(error) {
  console.error(error);
  const message = error?.message ?? "";

  if (message.includes("Stale or invalid extraction attempt") || error?.code === "40001") {
    return new ApiError(409, "stale_extraction_attempt", "A newer extraction attempt replaced this request");
  }
  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(502, "provider_invalid_output", "The model output failed persistence validation");
  }
  return new ApiError(500, "extraction_complete_failed", "Failed to save extracted Evidence");
}

function mapProviderError(error) {
  if (!(error instanceof EvidenceProviderError)) {
    console.error(error);
    return new ApiError(502, "provider_error", "Evidence extraction provider failed");
  }

  console.error({
    name: error.name,
    code: error.code,
    retryable: error.retryable,
    providerStatus: error.providerStatus,
  });

  return new ApiError(error.httpStatus, error.code, error.message);
}

async function markFailed(serviceClient, { rawInputId, userId, attemptId, errorCode }) {
  const { error } = await serviceClient.rpc("ar_fail_evidence_extraction", {
    p_raw_input_id: rawInputId,
    p_user_id: userId,
    p_attempt_id: attemptId,
    p_error_code: errorCode,
  });

  if (error) {
    console.error("Failed to record extraction failure", error);
  }
}

function buildSafetyIdentifier(userId) {
  return `ar_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export async function POST(request, { params }) {
  let serviceClient;
  let rawInputId;
  let userId;
  let attemptId;
  let extractionStarted = false;

  try {
    rawInputId = await getRawInputId(params);
    ({ userId } = await requireUser());
    const body = await readJson(request);
    const force = normalizeForce(body.force);
    const providerConfig = getEvidenceProviderConfig();

    serviceClient = createServiceClient();
    const rawInput = await assertRawInputOwner(
      rawInputId,
      userId,
      serviceClient,
      "id, raw_text, language, analysis_status",
    );

    attemptId = randomUUID();
    const { error: beginError } = await serviceClient.rpc("ar_begin_evidence_extraction", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_force: force,
      p_attempt_id: attemptId,
      p_model: providerConfig.model,
      p_prompt_version: EVIDENCE_PROMPT_VERSION,
    });

    if (beginError) throw mapBeginError(beginError);
    extractionStarted = true;

    let extraction;
    try {
      extraction = await extractPainEvidence({
        rawText: rawInput.raw_text,
        sourceLanguage: rawInput.language,
        requestId: attemptId,
        safetyIdentifier: buildSafetyIdentifier(userId),
        ...providerConfig,
      });
    } catch (error) {
      const mappedError = mapProviderError(error);
      await markFailed(serviceClient, {
        rawInputId,
        userId,
        attemptId,
        errorCode: mappedError.code,
      });
      throw mappedError;
    }

    const { data, error: completeError } = await serviceClient.rpc(
      "ar_complete_evidence_extraction",
      {
        p_raw_input_id: rawInputId,
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_evidences: extraction.evidences,
        p_model: extraction.model,
        p_provider_request_id: extraction.providerRequestId,
        p_input_tokens: extraction.usage.inputTokens,
        p_output_tokens: extraction.usage.outputTokens,
      },
    );

    if (completeError) {
      const mappedError = mapCompletionError(completeError);
      await markFailed(serviceClient, {
        rawInputId,
        userId,
        attemptId,
        errorCode: mappedError.code,
      });
      throw mappedError;
    }

    return NextResponse.json({
      analysis_status: "reviewing_evidence",
      evidences: data ?? [],
      extraction: {
        model: extraction.model,
        prompt_version: EVIDENCE_PROMPT_VERSION,
        provider_request_id: extraction.providerRequestId || null,
        usage: {
          input_tokens: extraction.usage.inputTokens,
          output_tokens: extraction.usage.outputTokens,
        },
      },
    });
  } catch (error) {
    if (
      extractionStarted &&
      serviceClient &&
      rawInputId &&
      userId &&
      attemptId &&
      !(error instanceof ApiError)
    ) {
      await markFailed(serviceClient, {
        rawInputId,
        userId,
        attemptId,
        errorCode: "unexpected_extraction_error",
      });
    }
    return jsonError(error);
  }
}
