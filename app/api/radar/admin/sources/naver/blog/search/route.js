import { NextResponse } from "next/server";

import { ApiError, jsonError } from "../../../../../../../../lib/auth/require-user.js";
import { readObjectBody } from "../../../../../../../../lib/candidates/review-api.mjs";
import { requireRadarCurator } from "../../../../../../../../lib/radar/curator.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistSourceSignals,
} from "../../../../../../../../lib/sources/service.mjs";
import {
  normalizeNaverBlogSearchInput,
  searchNaverBlogPosts,
  NaverBlogAdapterError,
} from "../../../../../../../../lib/sources/naver-blog-adapter.mjs";
import { createServiceClient } from "../../../../../../../../lib/supabase/service.js";

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
      input = normalizeNaverBlogSearchInput(body);
    } catch (error) {
      throw new ApiError(400, "invalid_naver_blog_search", error.message);
    }

    run = await createSourceIngestionRun(serviceClient, {
      sourcePlatform: "naver_blog",
      input,
      curatorUserId: userId,
    });

    const result = await searchNaverBlogPosts(input);
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
    if (error instanceof NaverBlogAdapterError) {
      return jsonError(new ApiError(error.status, error.code, error.message));
    }
    return jsonError(error);
  }
}
