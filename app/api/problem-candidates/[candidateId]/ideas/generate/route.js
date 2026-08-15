import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ApiError,
  jsonError,
  requireUser,
} from "../../../../../../lib/auth/require-user.js";
import {
  IDEA_PROMPT_VERSION,
  IdeaProviderError,
  generateGroundedIdeas,
  getIdeaProviderConfig,
} from "../../../../../../lib/ideas/openai-generator.mjs";
import {
  IdeaSourceError,
  loadIdeaBatch,
  loadIdeaGenerationSource,
} from "../../../../../../lib/ideas/service.mjs";
import { createServiceClient } from "../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";
export const maxDuration = 90;

async function getCandidateId(params) {
  const resolvedParams = await params;
  return resolvedParams.candidateId;
}

function buildSafetyIdentifier(userId) {
  return `ar_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

function mapSourceError(error) {
  if (error instanceof IdeaSourceError) {
    return new ApiError(error.httpStatus, error.code, error.message);
  }
  console.error(error);
  return new ApiError(500, "idea_source_load_failed", "Failed to load Idea generation source");
}

function mapProviderError(error) {
  if (!(error instanceof IdeaProviderError)) {
    console.error(error);
    return new ApiError(502, "provider_error", "Idea generation provider failed");
  }
  console.error({
    name: error.name,
    code: error.code,
    retryable: error.retryable,
    providerStatus: error.providerStatus,
  });
  return new ApiError(error.httpStatus, error.code, error.message);
}

function mapPersistenceError(error) {
  console.error(error);
  const message = error?.message ?? "";
  if (message.includes("Problem Card not found") || error?.code === "P0002") {
    return new ApiError(404, "candidate_not_found", "Problem Card not found");
  }
  if (
    message.includes("confirmed Problem Card") ||
    message.includes("completed source analysis")
  ) {
    return new ApiError(
      409,
      "idea_source_changed",
      "The Problem Card is no longer eligible for Idea generation",
    );
  }
  if (error?.code === "22023" || error?.code === "23514") {
    return new ApiError(
      502,
      "provider_invalid_output",
      "The Idea output failed persistence validation",
    );
  }
  return new ApiError(500, "idea_persistence_failed", "Failed to save generated Ideas");
}

export async function POST(_request, { params }) {
  try {
    const candidateId = await getCandidateId(params);
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    let source;
    try {
      source = await loadIdeaGenerationSource(serviceClient, candidateId, userId);
    } catch (error) {
      throw mapSourceError(error);
    }

    let providerConfig;
    try {
      providerConfig = getIdeaProviderConfig();
    } catch (error) {
      throw mapProviderError(error);
    }

    const requestId = randomUUID();
    let generation;
    try {
      generation = await generateGroundedIdeas({
        problemCard: source.problem_card,
        evidences: source.evidences,
        requestId,
        safetyIdentifier: buildSafetyIdentifier(userId),
        ...providerConfig,
      });
    } catch (error) {
      throw mapProviderError(error);
    }

    const { data: persisted, error: persistenceError } = await serviceClient.rpc(
      "ar_persist_idea_generation_batch",
      {
        p_problem_candidate_id: candidateId,
        p_user_id: userId,
        p_model: generation.model,
        p_prompt_version: IDEA_PROMPT_VERSION,
        p_provider_request_id: generation.providerRequestId || null,
        p_generation_input_tokens: generation.usage.inputTokens,
        p_generation_output_tokens: generation.usage.outputTokens,
        p_ideas: generation.ideas,
      },
    );

    if (persistenceError) throw mapPersistenceError(persistenceError);

    const batchId = String(persisted?.batch_id ?? "").trim();
    if (!batchId) {
      throw new ApiError(
        500,
        "idea_persistence_failed",
        "Idea generation was persisted without a batch identifier",
      );
    }

    let saved;
    try {
      saved = await loadIdeaBatch(serviceClient, batchId, userId);
    } catch (error) {
      console.error(error);
      throw new ApiError(
        500,
        "idea_batch_load_failed",
        "Ideas were created but could not be loaded",
      );
    }

    return NextResponse.json(
      {
        problem_candidate_id: candidateId,
        generation: {
          batch_id: batchId,
          model: generation.model,
          prompt_version: IDEA_PROMPT_VERSION,
          provider_request_id: generation.providerRequestId || null,
          usage: {
            input_tokens: generation.usage.inputTokens,
            output_tokens: generation.usage.outputTokens,
          },
        },
        ideas: saved.ideas,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
