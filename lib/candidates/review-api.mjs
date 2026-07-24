import { ApiError } from "../auth/require-user.js";

export async function readObjectBody(request, { allowEmpty = false } = {}) {
  const text = await request.text();
  if (!text.trim()) {
    if (allowEmpty) return {};
    throw new ApiError(400, "invalid_json", "Valid JSON object body is required");
  }

  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid object");
    return body;
  } catch {
    throw new ApiError(400, "invalid_json", "Valid JSON object body is required");
  }
}

export function mapCandidateReviewRpcError(
  error,
  fallbackCode = "candidate_review_failed",
  fallbackMessage = "Problem Candidate review failed",
) {
  console.error(error);
  const message = String(error?.message ?? "");

  if (message.includes("not found") || error?.code === "P0002") {
    return new ApiError(404, "candidate_not_found", "Problem Candidate or Evidence not found");
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new ApiError(400, "invalid_candidate_request", message || "Invalid Candidate request");
  }

  if (
    error?.code === "23514" ||
    error?.code === "23505" ||
    message.includes("reviewing_candidates") ||
    message.includes("transition") ||
    message.includes("must retain") ||
    message.includes("requires")
  ) {
    return new ApiError(409, "candidate_review_conflict", message || "Candidate review conflict");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}
