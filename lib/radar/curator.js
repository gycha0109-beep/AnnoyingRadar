import { ApiError, requireUser } from "../auth/require-user.js";

export async function requireRadarCurator(serviceClient) {
  const { user, userId } = await requireUser();
  const { data, error } = await serviceClient
    .from("ar_radar_curators")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new ApiError(500, "radar_curator_check_failed", "Failed to verify Radar curator permission");
  }
  if (!data?.role) {
    throw new ApiError(403, "radar_curator_required", "Radar curator permission is required");
  }

  return { user, userId, role: data.role };
}
