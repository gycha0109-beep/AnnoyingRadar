import assert from "node:assert/strict";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  listDiscoveryQueryMetrics,
  persistDiscoveredSourceSignals,
} from "../lib/sources/service.mjs";
import { searchNaverBlogPosts } from "../lib/sources/naver-blog-adapter.mjs";
import {
  buildDiscoveryQueryPlan,
  getDiscoveryQueryPlanSummary,
  selectDiscoveryRequestBudget,
  DISCOVERY_QUERY_PLAN_VERSION,
  DISCOVERY_QUERY_ALLOCATION_VERSION,
} from "../lib/sources/discovery-query-plan.mjs";

function parseIntegerFlag(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseDomains() {
  const prefix = "--domains=";
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) return undefined;
  return value.slice(prefix.length).split(",").map((item) => item.trim()).filter(Boolean);
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotDownstreamBoundaries(client) {
  const [rawInputs, painEvidences, publicProblems, publicEvidence, incidents] = await Promise.all([
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
    countRows(client, "ar_public_problem_evidence_snapshots"),
    countRows(client, "ar_source_incidents"),
  ]);
  return {
    raw_inputs: rawInputs,
    pain_evidences: painEvidences,
    public_problems: publicProblems,
    public_evidence: publicEvidence,
    source_incidents: incidents,
  };
}

async function resolveCuratorUserId(client) {
  const { data, error } = await client
    .from("ar_radar_curators")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No Radar curator is available for discovery provenance");
  return data.user_id;
}

async function executeQuery(client, curatorUserId, item) {
  const run = await createSourceIngestionRun(client, {
    sourcePlatform: "naver_blog",
    input: item.input,
    curatorUserId,
  });

  try {
    const result = await searchNaverBlogPosts(item.input);
    const persisted = await persistDiscoveredSourceSignals(client, {
      runId: run.id,
      queryText: item.input.q,
      signals: result.signals,
      fetchedCount: result.fetched_count,
      skippedCount: result.skipped_count,
    });
    return {
      query_key: item.query_key,
      domain: item.domain,
      family: item.family,
      allocation_mode: item.input.request_metadata?.discovery_allocation_mode ?? null,
      page_start: item.input.start,
      run_id: run.id,
      fetched_count: result.fetched_count,
      normalized_count: result.signals.length,
      discovery_continue_count: persisted.discovery.summary.continue_count,
      discovery_reject_count: persisted.discovery.summary.reject_count,
      discovery_reason_counts: persisted.discovery.summary.reason_counts,
      inserted_count: persisted.run.inserted_count,
      duplicate_count: persisted.run.duplicate_count,
      admission_candidate_count: persisted.run.admission_candidate_count,
      admission_review_count: persisted.run.admission_review_count,
      admission_reject_count: persisted.run.admission_reject_count,
      new_admission_candidate_count: persisted.run.new_admission_candidate_count ?? 0,
      new_admission_review_count: persisted.run.new_admission_review_count ?? 0,
      new_admission_reject_count: persisted.run.new_admission_reject_count ?? 0,
      provider_total: result.paging.total,
    };
  } catch (error) {
    await failSourceIngestionRun(client, run.id, error);
    throw error;
  }
}

function aggregate(executed) {
  const totals = {
    requests: executed.length,
    fetched_count: 0,
    normalized_count: 0,
    discovery_continue_count: 0,
    discovery_reject_count: 0,
    inserted_count: 0,
    duplicate_count: 0,
    admission_candidate_count: 0,
    admission_review_count: 0,
    admission_reject_count: 0,
    new_admission_candidate_count: 0,
    new_admission_review_count: 0,
    new_admission_reject_count: 0,
  };
  for (const item of executed) {
    for (const field of Object.keys(totals)) {
      if (field === "requests") continue;
      totals[field] += Number(item[field] ?? 0);
    }
  }
  return totals;
}

async function main() {
  const live = process.argv.includes("--live");
  const dryRun = process.argv.includes("--dry-run") || !live;
  const maxRequests = parseIntegerFlag("max-requests", 24);
  const domains = parseDomains();
  const plan = buildDiscoveryQueryPlan({ domains });
  const planSummary = getDiscoveryQueryPlanSummary({ domains });

  if (dryRun) {
    const selected = selectDiscoveryRequestBudget(plan, [], { maxRequests });
    console.log(JSON.stringify({
      status: "PLAN_ONLY",
      version: DISCOVERY_QUERY_PLAN_VERSION,
      allocation_version: DISCOVERY_QUERY_ALLOCATION_VERSION,
      plan: planSummary,
      batch: {
        max_requests: maxRequests,
        selected_requests: selected.map(({ query_key, domain, family, input }) => ({
          query_key,
          domain,
          family,
          q: input.q,
          allocation_mode: input.request_metadata?.discovery_allocation_mode ?? null,
          page_start: input.start,
        })),
        result_opportunity_count: selected.reduce((sum, item) => sum + item.input.limit, 0),
      },
      mutation: false,
    }, null, 2));
    return;
  }

  if (process.env.ALLOW_SOURCE_DISCOVERY_EXPANSION !== "1") {
    throw new Error("Live discovery is disabled unless ALLOW_SOURCE_DISCOVERY_EXPANSION=1");
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required for live discovery");
  }

  const client = createServiceClient();
  const curatorUserId = await resolveCuratorUserId(client);
  const historicalMetrics = await listDiscoveryQueryMetrics(client);
  const selected = selectDiscoveryRequestBudget(plan, historicalMetrics, { maxRequests });
  const before = await snapshotDownstreamBoundaries(client);
  const executed = [];
  const failed = [];

  console.log(`[source-discovery] version=${DISCOVERY_QUERY_PLAN_VERSION} allocation=${DISCOVERY_QUERY_ALLOCATION_VERSION} requests=${selected.length}`);
  for (const item of selected) {
    const mode = item.input.request_metadata?.discovery_allocation_mode ?? "unknown";
    console.log(`[source-discovery] query=${item.query_key} domain=${item.domain} family=${item.family} mode=${mode} start=${item.input.start} q=${JSON.stringify(item.input.q)} starting`);
    try {
      const result = await executeQuery(client, curatorUserId, item);
      executed.push(result);
      console.log(`[source-discovery] query=${item.query_key} start=${result.page_start} fetched=${result.fetched_count} cheap_reject=${result.discovery_reject_count} new=${result.inserted_count} new_candidate=${result.new_admission_candidate_count} new_review=${result.new_admission_review_count}`);
    } catch (error) {
      failed.push({
        query_key: item.query_key,
        code: typeof error?.code === "string" ? error.code : null,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`[source-discovery] query=${item.query_key} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const after = await snapshotDownstreamBoundaries(client);
  assert.deepEqual(after, before, "Discovery may mutate Source supply only; downstream product domains must stay unchanged");

  const totals = aggregate(executed);
  console.log(JSON.stringify({
    status: failed.length === 0 ? "PASS" : "PARTIAL_FAILURE",
    version: DISCOVERY_QUERY_PLAN_VERSION,
    allocation_version: DISCOVERY_QUERY_ALLOCATION_VERSION,
    plan: planSummary,
    batch: {
      selected_requests: selected.length,
      max_requests: maxRequests,
      selected: executed.map((item) => ({
        query_key: item.query_key,
        domain: item.domain,
        family: item.family,
        allocation_mode: item.allocation_mode,
        page_start: item.page_start,
      })),
      failed,
      totals,
    },
    boundary_invariants: { before, after, unchanged: true },
    blind_120_reads: 0,
    full_source_body_fetches: 0,
    publication_mutations: 0,
  }, null, 2));

  if (failed.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[source-discovery] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
