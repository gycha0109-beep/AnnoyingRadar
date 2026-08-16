import { ApiError } from "../auth/require-user.js";

export async function assertResearchProjectOwner(
  projectId,
  userId,
  serviceClient,
  columns = "*",
) {
  const { data, error } = await serviceClient
    .from("ar_research_projects")
    .select(columns)
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new ApiError(
      500,
      "research_project_owner_check_failed",
      "Failed to verify Research Project owner",
    );
  }
  if (!data) throw new ApiError(404, "research_project_not_found", "Research Project not found");
  return data;
}

export function mapResearchProjectRpcError(
  error,
  fallbackCode = "research_project_operation_failed",
  fallbackMessage = "Research Project operation failed",
) {
  console.error(error);
  const message = String(error?.message ?? "");

  if (error?.code === "P0002" || message.includes("not found")) {
    if (message.includes("Saved Problem")) {
      return new ApiError(404, "saved_problem_not_found", "Saved Problem not found");
    }
    if (message.includes("Idea Candidate")) {
      return new ApiError(404, "idea_not_found", "Idea Candidate not found");
    }
    if (message.includes("link")) {
      return new ApiError(404, "research_project_link_not_found", message);
    }
    return new ApiError(404, "research_project_not_found", "Research Project not found");
  }

  if (error?.code === "22023" || error?.code === "22P02") {
    return new ApiError(400, "invalid_research_project_request", message || "Invalid Research Project request");
  }

  if (
    error?.code === "23514" ||
    error?.code === "23503" ||
    message.includes("must be active") ||
    message.includes("must be restored") ||
    message.includes("requires") ||
    message.includes("owner must match") ||
    message.includes("Only an active Saved Problem")
  ) {
    return new ApiError(409, "research_project_conflict", message || "Research Project operation conflict");
  }

  return new ApiError(500, fallbackCode, fallbackMessage);
}
