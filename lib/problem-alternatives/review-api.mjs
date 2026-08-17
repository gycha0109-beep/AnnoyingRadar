import { ApiError } from "../auth/require-user.js";

export function mapProblemAlternativeRpcError(
  error,
  fallbackCode = "problem_alternative_operation_failed",
  fallbackMessage = "Problem alternative operation failed",
) {
  console.error(error);
  const message = String(error?.message ?? "");

  if (error?.code === "P0002" || message.includes("not found")) {
    if (message.includes("Problem Card")) {
      return new ApiError(404, "candidate_not_found", "Problem Card not found");
    }
    return new ApiError(404, "problem_alternative_not_found", "Problem alternative note not found");
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new ApiError(400, "invalid_problem_alternative_request", message || "Invalid Problem alternative request");
  }

  if (
    error?.code === "23514"
    || error?.code === "23503"
    || message.includes("requires")
    || message.includes("owner must match")
  ) {
    return new ApiError(409, "problem_alternative_conflict", message || "Problem alternative operation conflict");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}
