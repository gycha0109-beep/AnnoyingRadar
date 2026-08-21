import assert from "node:assert/strict";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistSourceSignals,
} from "../lib/sources/service.mjs";
import { searchNaverBlogPosts } from "../lib/sources/naver-blog-adapter.mjs";
import {
  buildGoldAcquisitionPlan,
  getCompletedGoldCampaignQueryKeys,
  getGoldAcquisitionPlanSummary,
  getGoldCampaignProgress,
  GOLD_ACQUISITION_CAMPAIGN_VERSION,
} from "../lib/sources/gold-campaign.mjs";

const MINIMUM_POOL_TARGET = 600;

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotBoundaries(client) {
  const [rawInputs, painEvidences, publicProblems] = await Promise.all([
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
  ]);
  return {
    raw_inputs: rawInputs,
    pain_evidences: painEvidences,
    public_problems: publicProblems,
  };
}

async function resolveCuratorUserId(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id, role")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No ar_radar_curators row is available for campaign provenance");
  return data.user_id;
}

async function executeCampaignQuery(client, curatorUserId, item) {
  const run = await createSourceIngestionRun(client, {
    sourcePlatform: "naver_blog",
    input: item.input,
    curatorUserId,
  });

  try {
    const result = await searchNaverBlogPosts(item.input);
    const persisted = await persistSourceSignals(client, {
      runId: run.id,
      queryText: item.input.q,
      signals: result.signals,
      fetchedCount: result.fetched_count,
      skippedCount: result.skipped_count,
    });
    return {
      query_key: item.query_key,
      bucket: item.bucket,
      domain: item.domain,
      run_id: run.id,
      fetched_count: result.fetched_count,
      normalized_count: result.signals.length,
      inserted_count: persisted.run.inserted_count,
      duplicate_count: persisted.run.duplicate_count,
      observation_count: persisted.observations.length,
      provider_total: result.paging.total,
    };
  } catch (error) {
    await failSourceIngestionRun(client, run.id, error);
    throw error;
  }
}

async function main() {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required for the live Gold acquisition campaign");
  }

  const client = createServiceClient();
  const curatorUserId = await resolveCuratorUserId(client);
  const before = await snapshotBoundaries(client);
  const plan = buildGoldAcquisitionPlan();
  const planSummary = getGoldAcquisitionPlanSummary();
  const completedBefore = await getCompletedGoldCampaignQueryKeys(client);
  const executed = [];
  const failed = [];
  let skippedCompleted = 0;

  console.log(`[gold-acquisition] campaign=${GOLD_ACQUISITION_CAMPAIGN_VERSION} planned_queries=${plan.length}`);
  console.log(`[gold-acquisition] already_completed=${completedBefore.size}`);

  for (const item of plan) {
    if (completedBefore.has(item.query_key)) {
      skippedCompleted += 1;
      console.log(`[gold-acquisition] query=${item.query_key} skipped=already_completed`);
      continue;
    }

    console.log(`[gold-acquisition] query=${item.query_key} bucket=${item.bucket} domain=${item.domain} q=${JSON.stringify(item.input.q)} starting`);
    try {
      const result = await executeCampaignQuery(client, curatorUserId, item);
      executed.push(result);
      console.log(`[gold-acquisition] query=${item.query_key} fetched=${result.fetched_count} new=${result.inserted_count} dup=${result.duplicate_count}`);
    } catch (error) {
      failed.push({
        query_key: item.query_key,
        message: error instanceof Error ? error.message : String(error),
        code: typeof error?.code === "string" ? error.code : null,
      });
      console.error(`[gold-acquisition] query=${item.query_key} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const after = await snapshotBoundaries(client);
  assert.deepEqual(after, before, "Gold acquisition must not mutate Raw Input, Pain Evidence, or Public Problem domains");

  const progress = await getGoldCampaignProgress(client);
  const allQueriesCompleted = progress.completed_queries === progress.planned_queries;
  let status = "PASS";
  if (failed.length > 0 || !allQueriesCompleted) status = "CONTINUATION_REQUIRED_FAILED_QUERIES";
  else if (progress.unique_signal_pool < MINIMUM_POOL_TARGET) status = "CONTINUATION_REQUIRED_POOL_BELOW_TARGET";

  console.log(JSON.stringify({
    status,
    campaign_version: GOLD_ACQUISITION_CAMPAIGN_VERSION,
    minimum_pool_target: MINIMUM_POOL_TARGET,
    plan: planSummary,
    run: {
      skipped_completed_queries: skippedCompleted,
      executed_queries: executed.length,
      failed_queries: failed,
      executed,
    },
    progress,
    boundary_invariants: {
      before,
      after,
      unchanged: true,
    },
    next_gate: progress.unique_signal_pool >= MINIMUM_POOL_TARGET
      ? "HUMAN_GOLD_LABELING"
      : "ACQUIRE_MORE_REAL_SOURCE_SIGNALS",
  }, null, 2));

  if (status !== "PASS") process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[gold-acquisition] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
