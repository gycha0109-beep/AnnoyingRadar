import { NextResponse } from "next/server";

import { jsonError } from "../../../../../../../lib/auth/require-user.js";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import { lockBlindEvaluationSet } from "../../../../../../../lib/sources/blind-evaluation.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST() {
  try {
    const serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const evaluation = await lockBlindEvaluationSet(serviceClient, { curatorUserId: userId });
    return NextResponse.json({ evaluation });
  } catch (error) {
    return jsonError(error);
  }
}
