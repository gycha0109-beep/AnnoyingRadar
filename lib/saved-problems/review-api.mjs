import { ApiError } from "../auth/require-user.js";

export function mapSavedProblemRpcError(
  error,
  fallbackCode = "saved_problem_failed",
  fallbackMessage = "Saved Problem operation failed",
) {
  console.error(error);
  const message = String(error?.message ?? "");

  if (message.includes("not found") || error?.code === "P0002") {
    return new ApiError(404, "saved_problem_not_found", message || "Saved Problem not found");
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new ApiError(400, "invalid_saved_problem_request", message || "Invalid Saved Problem request");
  }

  if (
    error?.code === "23514"
    || message.includes("confirmed Problem Card")
    || message.includes("completed source analysis")
    || message.includes("transition")
  ) {
    return new ApiError(409, "saved_problem_conflict", message || "Saved Problem conflict");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}
