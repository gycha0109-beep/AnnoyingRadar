import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildThreadsKeywordSearchUrl,
  normalizeThreadsPost,
  normalizeThreadsSearchInput,
  searchThreadsPosts,
  THREADS_ADAPTER_VERSION,
  ThreadsAdapterError,
} from "../lib/sources/threads-adapter.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Threads search contract keeps the official keyword-search dimensions bounded", () => {
  assert.deepEqual(normalizeThreadsSearchInput({ q: " 배달 불편 ", limit: 12 }), {
    q: "배달 불편",
    search_type: "RECENT",
    search_mode: "KEYWORD",
    limit: 12,
    since: null,
    until: null,
  });
  assert.throws(() => normalizeThreadsSearchInput({ q: "" }), /q must contain/);
  assert.throws(() => normalizeThreadsSearchInput({ q: "x", limit: 51 }), /between 1 and 50/);
  assert.throws(() => normalizeThreadsSearchInput({ q: "x", search_type: "OTHER" }), /TOP or RECENT/);
});

test("Threads adapter builds the official keyword_search request without embedding credentials", () => {
  const url = buildThreadsKeywordSearchUrl({
    q: "헬스장 혼잡",
    search_type: "TOP",
    search_mode: "KEYWORD",
    limit: 20,
    since: "2026-08-01T00:00:00Z",
    until: "2026-08-18T00:00:00Z",
  });

  assert.equal(url.origin, "https://graph.threads.net");
  assert.equal(url.pathname, "/keyword_search");
  assert.equal(url.searchParams.get("q"), "헬스장 혼잡");
  assert.equal(url.searchParams.get("search_type"), "TOP");
  assert.equal(url.searchParams.get("search_mode"), "KEYWORD");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.match(url.searchParams.get("fields"), /id/);
  assert.match(url.searchParams.get("fields"), /text/);
  assert.match(url.searchParams.get("fields"), /permalink/);
  assert.equal(url.searchParams.has("access_token"), false);
});

test("Threads posts normalize into deterministic Source Signals and textless posts are skipped", () => {
  const signal = normalizeThreadsPost({
    id: "thread-1",
    text: " 최소 주문 금액 때문에 필요 없는 메뉴를 더 시켰다. ",
    username: "sample_user",
    permalink: "https://www.threads.net/@sample_user/post/abc",
    timestamp: "2026-08-18T01:02:03+0000",
    media_type: "TEXT_POST",
    is_quote_post: false,
  });

  assert.equal(signal.source_platform, "threads");
  assert.equal(signal.external_content_id, "thread-1");
  assert.equal(signal.raw_text, "최소 주문 금액 때문에 필요 없는 메뉴를 더 시켰다.");
  assert.equal(signal.adapter_version, THREADS_ADAPTER_VERSION);
  assert.match(signal.content_hash, /^[0-9a-f]{64}$/);
  assert.equal(normalizeThreadsPost({ id: "thread-2", text: "  " }), null);
});

test("live adapter uses OAuth bearer auth and never needs a token in the URL", async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: [
            { id: "1", text: "불편하다", permalink: "https://www.threads.net/post/1", timestamp: "2026-08-18T00:00:00Z" },
            { id: "2", text: "" },
          ],
          paging: { cursors: { after: "cursor" } },
        };
      },
    };
  };

  const result = await searchThreadsPosts({ q: "불편" }, { accessToken: "secret-token", fetchImpl });
  assert.equal(capturedOptions.headers.Authorization, "Bearer secret-token");
  assert.equal(capturedUrl.searchParams.has("access_token"), false);
  assert.equal(result.fetched_count, 2);
  assert.equal(result.signals.length, 1);
  assert.equal(result.skipped_count, 1);
});

test("missing Threads credential fails closed before any network request", async () => {
  await assert.rejects(
    () => searchThreadsPosts({ q: "불편" }, { accessToken: "", fetchImpl: async () => assert.fail("must not fetch") }),
    (error) => error instanceof ThreadsAdapterError && error.code === "threads_not_configured" && error.status === 503,
  );
});

test("source persistence is service-role only and preserves query observations", async () => {
  const migration = await read("supabase/migrations/022_source_signal_foundation.sql");
  for (const table of [
    "ar_source_ingestion_runs",
    "ar_source_signals",
    "ar_source_signal_observations",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));

  assert.match(migration, /unique \(source_platform, external_content_id\)/);
  assert.match(migration, /unique \(ingestion_run_id, source_signal_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.ar_source_signals from public, anon, authenticated/);
});

test("Threads ingestion endpoint is curator-only and records a run before external fetch", async () => {
  const route = await read("app/api/radar/admin/sources/threads/search/route.js");
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /createSourceIngestionRun/);
  assert.ok(route.indexOf("createSourceIngestionRun") < route.indexOf("searchThreadsPosts(input)"));
  assert.match(route, /persistSourceSignals/);
  assert.match(route, /failSourceIngestionRun/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*THREADS|access_token/);
});

test("Source Lab stays private and keeps Threads credentials server-side", async () => {
  const [page, env] = await Promise.all([
    read("app/curator/sources/page.js"),
    read(".env.local.example"),
  ]);
  assert.match(page, /ar_radar_curators/);
  assert.match(page, /redirect\("\/workspace"\)/);
  assert.match(page, /ThreadsSourceSearchForm/);
  assert.match(env, /THREADS_ACCESS_TOKEN/);
  assert.match(env, /threads_keyword_search/);
});
