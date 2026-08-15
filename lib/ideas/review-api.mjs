import { ApiError } from "../auth/require-user.js";
import { canTransitionIdeaStatus, normalizeIdeaStatus } from "./contracts.mjs";

export async function assertIdeaOwner(ideaId, userId, serviceClient, columns = "*") {
  const { data, error } = await serviceClient
    .from("ar_idea_candidates")
    .select(columns)
    .eq("id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new ApiError(500, "idea_owner_check_failed", "Failed to verify Idea Candidate owner");
  }
  if (!data) throw new ApiError(404, "idea_not_found", "Idea Candidate not found");
  return data;
}

export function normalizeIdeaStatusRequest(body, currentStatus) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Idea status request must be an object");
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "status") {
    throw new TypeError("Idea status request must contain only status");
  }

  const targetStatus = normalizeIdeaStatus(body.status);
  if (!canTransitionIdeaStatus(currentStatus, targetStatus)) {
    throw new TypeError(`Invalid Idea Candidate status transition: ${currentStatus} -> ${targetStatus}`);
  }
  return targetStatus;
}

export function mapIdeaReviewRpcError(
  error,
  fallbackCode = "idea_review_failed",
  fallbackMessage = "Idea Candidate review failed",
) {
  console.error(error);
  const message = String(error?.message ?? "");

  if (message.includes("not found") || error?.code === "P0002") {
    return new ApiError(404, "idea_not_found", "Idea Candidate not found");
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new ApiError(400, "invalid_idea_request", message || "Invalid Idea Candidate request");
  }

  if (
    error?.code === "23514" ||
    message.includes("transition") ||
    message.includes("restored before editing")
  ) {
    return new ApiError(409, "idea_review_conflict", message || "Idea Candidate review conflict");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}