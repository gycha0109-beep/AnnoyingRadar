import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  freezeGoldBenchmark,
  GoldCampaignError,
} from "../../../../../../../lib/sources/gold-campaign.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const benchmark = await freezeGoldBenchmark(serviceClient, { curatorUserId: userId });
    return NextResponse.json({ benchmark });
  } catch (error) {
    if (error instanceof GoldCampaignError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
