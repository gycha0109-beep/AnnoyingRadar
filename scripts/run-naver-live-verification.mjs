import assert from "node:assert/strict";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistSourceSignals,
} from "../lib/sources/service.mjs";
import {
  NaverBlogAdapterError,
  normalizeNaverBlogSearchInput,
  searchNaverBlogPosts,
} from "../lib/sources/naver-blog-adapter.mjs";

const args = new Set(process.argv.slice(2));
const adapterOnly = args.has("--adapter-only");

function uniqueCount(signals) {
  return new Set(signals.map((signal) => `${signal.source_platform}:${signal.external_content_id}`)).size;
}

function assertSignalContract(signal, scenarioName) {
  assert.equal(signal.source_platform, "naver_blog", `${scenarioName}: source_platform`);
  assert.ok(signal.external_content_id, `${scenarioName}: external_content_id`);
  assert.ok(signal.raw_text, `${scenarioName}: raw_text`);
  assert.equal(signal.acquisition_method, "official_api", `${scenarioName}: acquisition_method`);
  assert.equal(signal.content_scope, "search_snippet", `${scenarioName}: content_scope`);
  assert.match(signal.content_hash, /^[a-f0-9]{64}$/, `${scenarioName}: content_hash`);
  assert.match(signal.canonical_url, /^https?:\/\//, `${scenarioName}: canonical_url`);
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function snapshotCounts(client) {
  const [runs, signals, observations, rawInputs, painEvidences, publicProblems] = await Promise.all([
    countRows(client, "ar_source_ingestion_runs"),
    countRows(client, "ar_source_signals"),
    countRows(client, "ar_source_signal_observations"),
    countRows(client, "ar_raw_inputs"),
    countRows(client, "ar_pain_evidences"),
    countRows(client, "ar_public_problems"),
  ]);
  return {
    runs,
    signals,
    observations,
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
  if (!data?.user_id) throw new Error("No ar_radar_curators row is available for persistence verification");
  return data.user_id;
}

async function persistScenario(client, curatorUserId, scenario, result) {
  const run = await createSourceIngestionRun(client, {
    sourcePlatform: "naver_blog",
    input: result.input,
    curatorUserId,
  });
  try {
    const persisted = await persistSourceSignals(client, {
      runId: run.id,
      queryText: result.input.q,
      signals: result.signals,
      fetchedCount: result.fetched_count,
      skippedCount: result.skipped_count,
    });
    return {
      scenario: scenario.name,
      run_id: run.id,
      inserted_count: persisted.run.inserted_count,
      duplicate_count: persisted.run.duplicate_count,
      observation_count: persisted.observations.length,
    };
  } catch (error) {
    await failSourceIngestionRun(client, run.id, error);
    throw error;
  }
}

async function main() {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are missing; load .env.local before running this verification");
  }

  const scenarios = [
    { name: "complaint_recent", input: { q: "불편", sort: "date", limit: 20, start: 1 }, persist: true },
    { name: "complaint_specific", input: { q: "배달 불편", sort: "date", limit: 20, start: 1 }, persist: true },
    { name: "neutral_relevance", input: { q: "배달", sort: "sim", limit: 20, start: 1 }, persist: true },
    { name: "noise_relevance", input: { q: "추천", sort: "sim", limit: 20, start: 1 }, persist: false },
    { name: "complaint_page_two", input: { q: "불편", sort: "date", limit: 20, start: 21 }, persist: false },
  ];

  const results = new Map();
  const summary = [];
  for (const scenario of scenarios) {
    console.log(`[naver-live-verification] scenario=${scenario.name} starting`);
    const result = await searchNaverBlogPosts(scenario.input);
    assert.ok(result.fetched_count <= result.input.limit, `${scenario.name}: fetched_count exceeds limit`);
    assert.ok(result.signals.length <= result.fetched_count, `${scenario.name}: signals exceed fetched_count`);
    for (const signal of result.signals) assertSignalContract(signal, scenario.name);
    results.set(scenario.name, result);
    summary.push({
      scenario: scenario.name,
      q: result.input.q,
      sort: result.input.sort,
      start: result.input.start,
      requested_limit: result.input.limit,
      fetched_count: result.fetched_count,
      normalized_count: result.signals.length,
      unique_count: uniqueCount(result.signals),
      skipped_count: result.skipped_count,
      provider_total: result.paging.total,
    });
    console.log(`[naver-live-verification] scenario=${scenario.name} fetched=${result.fetched_count} normalized=${result.signals.length}`);
  }

  const totalUsableSignals = [...results.values()].reduce((sum, result) => sum + result.signals.length, 0);
  if (totalUsableSignals === 0) {
    const error = new Error("BLOCKED_NO_LIVE_SIGNALS: Naver Search API returned no usable Source Signals across all live scenarios");
    error.code = "BLOCKED_NO_LIVE_SIGNALS";
    throw error;
  }

  assert.throws(() => normalizeNaverBlogSearchInput({ q: "" }), /q must contain/);
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "불편", limit: 51 }), /between 1 and 50/);
  assert.throws(() => normalizeNaverBlogSearchInput({ q: "불편", start: 1000, limit: 2 }), /position 1000/);
  await assert.rejects(
    () => searchNaverBlogPosts(
      { q: "불편", limit: 1 },
      { clientId: "", clientSecret: "", fetchImpl: async () => assert.fail("must not fetch") },
    ),
    (error) => error instanceof NaverBlogAdapterError && error.code === "naver_blog_not_configured",
  );

  let persistence = null;
  if (!adapterOnly) {
    const client = createServiceClient();
    const curatorUserId = await resolveCuratorUserId(client);
    const before = await snapshotCounts(client);
    const persistedRuns = [];

    for (const scenario of scenarios.filter((item) => item.persist)) {
      persistedRuns.push(await persistScenario(client, curatorUserId, scenario, results.get(scenario.name)));
    }

    const repeatScenario = scenarios.find((scenario) => scenario.persist && results.get(scenario.name).signals.length > 0);
    assert.ok(repeatScenario, "At least one persisted scenario must contain a usable Source Signal");
    const repeatResult = results.get(repeatScenario.name);
    const repeat = await persistScenario(
      client,
      curatorUserId,
      { ...repeatScenario, name: `${repeatScenario.name}_repeat` },
      repeatResult,
    );
    persistedRuns.push(repeat);

    const expectedRepeatDuplicates = uniqueCount(repeatResult.signals);
    assert.equal(repeat.duplicate_count, expectedRepeatDuplicates, "Repeated persistence must dedupe every Source Signal");
    assert.equal(repeat.observation_count, expectedRepeatDuplicates, "Repeated persistence must create a new Observation for every deduped Source Signal");

    const after = await snapshotCounts(client);
    const insertedTotal = persistedRuns.reduce((sum, item) => sum + item.inserted_count, 0);
    const observationTotal = persistedRuns.reduce((sum, item) => sum + item.observation_count, 0);

    assert.equal(after.runs - before.runs, persistedRuns.length, "Unexpected ingestion run count delta");
    assert.equal(after.signals - before.signals, insertedTotal, "Unexpected Source Signal count delta");
    assert.equal(after.observations - before.observations, observationTotal, "Unexpected Observation count delta");
    assert.equal(after.raw_inputs, before.raw_inputs, "Naver ingestion must not mutate ar_raw_inputs");
    assert.equal(after.pain_evidences, before.pain_evidences, "Naver ingestion must not mutate ar_pain_evidences");
    assert.equal(after.public_problems, before.public_problems, "Naver ingestion must not mutate ar_public_problems");

    persistence = {
      before,
      after,
      inserted_total: insertedTotal,
      observation_total: observationTotal,
      runs: persistedRuns,
      boundary_invariants: {
        raw_inputs_unchanged: true,
        pain_evidences_unchanged: true,
        public_problems_unchanged: true,
      },
    };
  }

  console.log(JSON.stringify({
    status: "PASS",
    adapter_only: adapterOnly,
    total_usable_signals: totalUsableSignals,
    scenarios: summary,
    local_contract_checks: {
      empty_query_rejected: true,
      limit_51_rejected: true,
      position_over_1000_rejected: true,
      missing_credentials_rejected_without_network_call: true,
      zero_signal_pass_forbidden: true,
    },
    persistence,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[naver-live-verification] FAILED: ${error.name}: ${error.message}`);
  if (error instanceof NaverBlogAdapterError) {
    console.error(JSON.stringify({ code: error.code, status: error.status, upstream: error.upstream ?? null }, null, 2));
  } else if (error?.code) {
    console.error(JSON.stringify({ code: error.code }, null, 2));
  }
  process.exitCode = 1;
});
