import { ApiError } from "../auth/require-user.js";

export function mapRadarRpcError(error, fallbackCode, fallbackMessage) {
  const pgCode = error?.code ?? null;
  const message = error?.message || fallbackMessage;

  if (pgCode === "22023") return new ApiError(400, "invalid_radar_request", message);
  if (pgCode === "42501") return new ApiError(403, "radar_curator_required", message);
  if (pgCode === "P0002") return new ApiError(404, "public_problem_not_found", message);
  if (pgCode === "23505") return new ApiError(409, "public_radar_conflict", message);
  if (pgCode === "23514") return new ApiError(409, "public_radar_invariant_failed", message);

  return new ApiError(500, fallbackCode, fallbackMessage);
}

export function unwrapRpcRow(data) {
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}
