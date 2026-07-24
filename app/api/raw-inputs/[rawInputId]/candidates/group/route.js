import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ApiError,
  assertRawInputOwner,
  jsonError,
  requireUser,
} from "../../../../../../lib/auth/require-user.js";
import {
  CANDIDATE_PROMPT_VERSION,
  CandidateProviderError,
  getCandidateProviderConfig,
  groupProblemCandidates,
} from "../../../../../../lib/candidates/openai-grouper.mjs";
import { loadCandidateReview } from "../../../../../../lib/candidates/service.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const maxDuration = 90;

const CONFIRMED_EVIDENCE_SELECT = [
  "id",
  "original_text",
  "summary_ko",
  "pain_type",
  "target_user",
  "situation",
  "sentiment_level",
  "intensity_level",
  "order_index",
  "created_at",
].join(", ");

async function getRawInputId(params) {
  const resolvedParams = await params;
  return resolvedParams.rawInputId;
}

function mapBeginError(error) {
  console.error(error);
  const message = error?.message ?? "";
  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }
  if (message.includes("Confirmed Candidate exists")) {
    return new ApiError(409, "confirmed_candidate_exists", "Confirmed Candidate blocks grouping");
  }
  if (message.includes("already in progress")) {
    return new ApiError(409, "grouping_in_progress", "Candidate grouping is already in progress");
  }
  if (message.includes("not allowed from status")) {
    return new ApiError(409, "grouping_not_allowed", "Candidate grouping is not allowed in the current status");
  }
  if (message.includes("confirmed Evidence")) {
    return new ApiError(409, "confirmed_evidence_required", message);
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(400, "invalid_grouping_request", message || "Invalid grouping request");
  }
  return new ApiError(500, "grouping_begin_failed", "Failed to begin Candidate grouping");
}

function mapCompletionError(error) {
  console.error(error);
  const message = error?.message ?? "";
  if (message.includes("Stale or invalid grouping attempt") || error?.code === "40001") {
    return new ApiError(409, "stale_grouping_attempt", "A newer grouping attempt replaced this request");
  }
  if (message.includes("Raw input not found")) {
    return new ApiError(404, "raw_input_not_found", "Raw Input not found");
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(502, "provider_invalid_output", "The grouping output failed persistence validation");
  }
  return new ApiError(500, "grouping_complete_failed", "Failed to save Problem Candidates");
}

function mapProviderError(error) {
  if (!(error instanceof CandidateProviderError)) {
    console.error(error);
    return new ApiError(502, "provider_error", "Candidate grouping provider failed");
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
  const { error } = await serviceClient.rpc("ar_fail_candidate_grouping", {
    p_raw_input_id: rawInputId,
    p_user_id: userId,
    p_attempt_id: attemptId,
    p_error_code: errorCode,
  });
  if (error) console.error("Failed to record Candidate grouping failure", error);
}

function buildSafetyIdentifier(userId) {
  return `ar_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export async function POST(_request, { params }) {
  let serviceClient;
  let rawInputId;
  let userId;
  let attemptId;
  let groupingStarted = false;
  let groupingCompleted = false;
  let failureRecorded = false;

  async function recordFailure(errorCode) {
    if (
      failureRecorded ||
      groupingCompleted ||
      !groupingStarted ||
      !serviceClient ||
      !rawInputId ||
      !userId ||
      !attemptId
    ) {
      return;
    }
    failureRecorded = true;
    await markFailed(serviceClient, {
      rawInputId,
      userId,
      attemptId,
      errorCode,
    });
  }

  try {
    rawInputId = await getRawInputId(params);
    ({ userId } = await requireUser());
    const providerConfig = getCandidateProviderConfig();
    serviceClient = createServiceClient();

    await assertRawInputOwner(rawInputId, userId, serviceClient, "id, analysis_status");
    attemptId = randomUUID();

    const { error: beginError } = await serviceClient.rpc("ar_begin_candidate_grouping", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_model: providerConfig.model,
      p_prompt_version: CANDIDATE_PROMPT_VERSION,
    });
    if (beginError) throw mapBeginError(beginError);
    groupingStarted = true;

    const { data: evidences, error: evidenceError } = await serviceClient
      .from("ar_pain_evidences")
      .select(CONFIRMED_EVIDENCE_SELECT)
      .eq("raw_input_id", rawInputId)
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (evidenceError) {
      console.error(evidenceError);
      const mappedError = new ApiError(
        500,
        "confirmed_evidence_load_failed",
        "Failed to load confirmed Evidence",
      );
      await recordFailure(mappedError.code);
      throw mappedError;
    }

    let grouping;
    try {
      grouping = await groupProblemCandidates({
        evidences: evidences ?? [],
        requestId: attemptId,
        safetyIdentifier: buildSafetyIdentifier(userId),
        ...providerConfig,
      });
    } catch (error) {
      const mappedError = mapProviderError(error);
      await recordFailure(mappedError.code);
      throw mappedError;
    }

    const { error: completeError } = await serviceClient.rpc("ar_complete_candidate_grouping", {
      p_raw_input_id: rawInputId,
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_candidates: grouping.candidates,
      p_model: grouping.model,
      p_provider_request_id: grouping.providerRequestId,
      p_input_tokens: grouping.usage.inputTokens,
      p_output_tokens: grouping.usage.outputTokens,
    });

    if (completeError) {
      const mappedError = mapCompletionError(completeError);
      await recordFailure(mappedError.code);
      throw mappedError;
    }
    groupingCompleted = true;

    let candidates;
    try {
      candidates = await loadCandidateReview(serviceClient, rawInputId, userId);
    } catch (error) {
      console.error(error);
      throw new ApiError(500, "candidate_list_failed", "Candidates were created but could not be loaded");
    }

    return NextResponse.json({
      analysis_status: "reviewing_candidates",
      candidates,
      grouping: {
        model: grouping.model,
        prompt_version: CANDIDATE_PROMPT_VERSION,
        provider_request_id: grouping.providerRequestId || null,
        error_code: null,
        usage: {
          input_tokens: grouping.usage.inputTokens,
          output_tokens: grouping.usage.outputTokens,
        },
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      await recordFailure("unexpected_grouping_error");
    }
    return jsonError(error);
  }
}
