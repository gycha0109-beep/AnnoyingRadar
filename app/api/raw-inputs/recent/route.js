import { NextResponse } from "next/server";

import { ApiError, jsonError, requireUser } from "../../../../lib/auth/require-user.js";
import { createServiceClient } from "../../../../lib/supabase/service.js";

export const runtime = "nodejs";

const RAW_INPUT_SELECT =
  "id, user_id, raw_text, source_type, source_url, source_memo, language, analysis_status, content_hash, created_at, updated_at";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient
      .from("ar_raw_inputs")
      .select(RAW_INPUT_SELECT)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3);

    if (error) {
      console.error(error);
      throw new ApiError(
        500,
        "recent_raw_inputs_fetch_failed",
        "Failed to fetch recent raw inputs",
      );
    }

    return NextResponse.json({ raw_inputs: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
