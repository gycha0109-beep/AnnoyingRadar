import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../lib/candidates/review-api.mjs";
import { requireRadarCurator } from "../../../../../../../lib/radar/curator.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistSourceSignals,
} from "../../../../../../../lib/sources/service.mjs";
import {
  normalizeThreadsSearchInput,
  searchThreadsPosts,
  ThreadsAdapterError,
} from "../../../../../../../lib/sources/threads-adapter.mjs";
import { createServiceClient } from "../../../../../../../lib/supabase/service.js";

export const runtime = "nodejs";

export async function POST(request) {
  let run = null;
  let serviceClient = null;

  try {
    serviceClient = createServiceClient();
    const { userId } = await requireRadarCurator(serviceClient);
    const body = await readObjectBody(request);

    let input;
    try {
      input = normalizeThreadsSearchInput(body);
    } catch (error) {
      throw new ApiError(400, "invalid_threads_search", error.message);
    }

    run = await createSourceIngestionRun(serviceClient, {
      sourcePlatform: "threads",
      input,
      curatorUserId: userId,
    });

    const result = await searchThreadsPosts(input);
    const persisted = await persistSourceSignals(serviceClient, {
      runId: run.id,
      queryText: input.q,
      signals: result.signals,
      fetchedCount: result.fetched_count,
      skippedCount: result.skipped_count,
    });

    return NextResponse.json({
      run: persisted.run,
      signals: persisted.signals,
      observation_count: persisted.observations.length,
      paging: result.paging,
    });
  } catch (error) {
    if (serviceClient && run?.id) {
      await failSourceIngestionRun(serviceClient, run.id, error);
    }
    if (error instanceof ThreadsAdapterError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
