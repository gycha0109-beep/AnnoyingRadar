import assert from "node:assert/strict";

import { createServiceClient } from "../lib/supabase/service.js";
import {
  createSourceIngestionRun,
  failSourceIngestionRun,
  persistSourceSignals,
} from "../lib/sources/service.mjs";
import {
  normalizeThreadsSearchInput,
  searchThreadsPosts,
  ThreadsAdapterError,
} from "../lib/sources/threads-adapter.mjs";

const args = new Set(process.argv.slice(2));
const adapterOnly = args.has("--adapter-only");

function uniqueCount(signals) {
  return new Set(signals.map((signal) => signal.external_content_id)).size;
}

function assertSignalContract(signal, scenarioName) {
  assert.equal(signal.source_platform, "threads", `${scenarioName}: source_platform`);
  assert.ok(signal.external_content_id, `${scenarioName}: external_content_id`);
  assert.ok(signal.raw_text, `${scenarioName}: raw_text`);
  assert.match(signal.content_hash, /^[a-f0-9]{64}$/, `${scenarioName}: content_hash`);
  assert.ok(signal.adapter_version, `${scenarioName}: adapter_version`);
  if (signal.canonical_url !== null) assert.match(signal.canonical_url, /^https?:\/\//, `${scenarioName}: canonical_url`);
  if (signal.published_at !== null) assert.ok(!Number.isNaN(Date.parse(signal.published_at)), `${scenarioName}: published_at`);
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
  return { runs, signals, observations, raw_inputs: rawInputs, pain_evidences: painEvidences, public_problems: publicProblems };
}

async function resolveCuratorUserId(client) {
  const { data, error } = await client.from("ar_radar_curators").select("user_id, role").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No ar_radar_curators row is available for persistence verification");
  return data.user_id;
}

async function persistScenario(client, curatorUserId, scenario, result) {
  const run = await createSourceIngestionRun(client, { sourcePlatform: "threads", input: result.input, curatorUserId });
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
  if (!process.env.THREADS_ACCESS_TOKEN) throw new Error("THREADS_ACCESS_TOKEN is missing; load .env.local before running this verification");

  const until = new Date();
  const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
  const scenarios = [
    { name: "complaint_recent", input: { q: "배달 불편", search_type: "RECENT", search_mode: "KEYWORD", limit: 10 }, persist: true },
    { name: "neutral_recent", input: { q: "배달", search_type: "RECENT", search_mode: "KEYWORD", limit: 10 }, persist: true },
    { name: "noise_top", input: { q: "추천", search_type: "TOP", search_mode: "KEYWORD", limit: 10 }, persist: true },
    { name: "top_compare", input: { q: "배달", search_type: "TOP", search_mode: "KEYWORD", limit: 10 }, persist: false },
    { name: "tag_recent", input: { q: "배달", search_type: "RECENT", search_mode: "TAG", limit: 10 }, persist: false },
    { name: "window_recent", input: { q: "예약", search_type: "RECENT", search_mode: "KEYWORD", limit: 10, since: since.toISOString(), until: until.toISOString() }, persist: false },
    { name: "limit_one", input: { q: "앱", search_type: "RECENT", search_mode: "KEYWORD", limit: 1 }, persist: false },
  ];

  const results = new Map();
  const scenarioSummary = [];

  for (const scenario of scenarios) {
    console.log(`[threads-live-verification] scenario=${scenario.name} starting`);
    const result = await searchThreadsPosts(scenario.input);
    assert.ok(result.fetched_count <= result.input.limit, `${scenario.name}: fetched_count exceeds limit`);
    assert.ok(result.signals.length <= result.fetched_count, `${scenario.name}: signals exceed fetched_count`);
    for (const signal of result.signals) assertSignalContract(signal, scenario.name);
    results.set(scenario.name, result);
    scenarioSummary.push({ scenario: scenario.name, q: result.input.q, search_type: result.input.search_type, search_mode: result.input.search_mode, requested_limit: result.input.limit, fetched_count: result.fetched_count, normalized_count: result.signals.length, unique_count: uniqueCount(result.signals), skipped_count: result.skipped_count });
    console.log(`[threads-live-verification] scenario=${scenario.name} fetched=${result.fetched_count} normalized=${result.signals.length}`);
  }

  assert.throws(() => normalizeThreadsSearchInput({ q: "", search_type: "RECENT", search_mode: "KEYWORD", limit: 10 }), /q must contain/);
  assert.throws(() => normalizeThreadsSearchInput({ q: "배달", search_type: "RECENT", search_mode: "KEYWORD", limit: 51 }), /limit must be/);
  assert.throws(() => normalizeThreadsSearchInput({ q: "배달", search_type: "RECENT", search_mode: "KEYWORD", since: until.toISOString(), until: since.toISOString() }), /since must be earlier/);
  await assert.rejects(() => searchThreadsPosts({ q: "배달", search_type: "RECENT", search_mode: "KEYWORD", limit: 1 }, { accessToken: "" }), (error) => error instanceof ThreadsAdapterError && error.code === "threads_not_configured");

  const recentIds = new Set(results.get("neutral_recent").signals.map((signal) => signal.external_content_id));
  const topIds = new Set(results.get("top_compare").signals.map((signal) => signal.external_content_id));
  const topRecentOverlap = [...recentIds].filter((id) => topIds.has(id)).length;

  let persistence = null;
  if (!adapterOnly) {
    const client = createServiceClient();
    const curatorUserId = await resolveCuratorUserId(client);
    const before = await snapshotCounts(client);
    const persistedRuns = [];
    for (const scenario of scenarios.filter((item) => item.persist)) persistedRuns.push(await persistScenario(client, curatorUserId, scenario, results.get(scenario.name)));
    const repeatScenario = scenarios.find((item) => item.name === "complaint_recent");
    const repeatResult = results.get("complaint_recent");
    const repeat = await persistScenario(client, curatorUserId, { ...repeatScenario, name: "complaint_recent_repeat" }, repeatResult);
    persistedRuns.push(repeat);

    const expectedRepeatDuplicates = uniqueCount(repeatResult.signals);
    assert.equal(repeat.duplicate_count, expectedRepeatDuplicates, "Repeated persistence must dedupe every previously persisted Source Signal");
    assert.equal(repeat.observation_count, expectedRepeatDuplicates, "Repeated persistence must create a new Observation for every deduped Source Signal");

    const after = await snapshotCounts(client);
    const insertedTotal = persistedRuns.reduce((sum, item) => sum + item.inserted_count, 0);
    const observationTotal = persistedRuns.reduce((sum, item) => sum + item.observation_count, 0);
    assert.equal(after.runs - before.runs, persistedRuns.length, "Unexpected ingestion run count delta");
    assert.equal(after.signals - before.signals, insertedTotal, "Unexpected Source Signal count delta");
    assert.equal(after.observations - before.observations, observationTotal, "Unexpected Observation count delta");
    assert.equal(after.raw_inputs, before.raw_inputs, "Threads ingestion must not mutate ar_raw_inputs");
    assert.equal(after.pain_evidences, before.pain_evidences, "Threads ingestion must not mutate ar_pain_evidences");
    assert.equal(after.public_problems, before.public_problems, "Threads ingestion must not mutate ar_public_problems");
    persistence = { before, after, inserted_total: insertedTotal, observation_total: observationTotal, runs: persistedRuns, boundary_invariants: { raw_inputs_unchanged: true, pain_evidences_unchanged: true, public_problems_unchanged: true } };
  }

  console.log(JSON.stringify({ status: "PASS", adapter_only: adapterOnly, scenarios: scenarioSummary, comparisons: { neutral_recent_vs_top_overlap: topRecentOverlap }, local_contract_checks: { empty_query_rejected: true, limit_51_rejected: true, reversed_window_rejected: true, missing_token_rejected_without_network_call: true }, persistence }, null, 2));
}

main().catch((error) => {
  console.error(`[threads-live-verification] FAILED: ${error.name}: ${error.message}`);
  if (error instanceof ThreadsAdapterError) {
    console.error(JSON.stringify({ code: error.code, status: error.status, upstream: error.upstream ?? null }, null, 2));
  }
  process.exitCode = 1;
});
