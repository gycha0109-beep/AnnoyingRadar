import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyDiscoverySignal,
  filterDiscoverySignals,
  DISCOVERY_PREFILTER_VERSION,
} from "../lib/sources/discovery-prefilter.mjs";
import {
  buildDiscoveryQueryPlan,
  getDiscoveryQueryPlanSummary,
  scoreDiscoveryRunMetrics,
  selectDiscoveryRequestBudget,
  DISCOVERY_QUERY_PLAN_VERSION,
} from "../lib/sources/discovery-query-plan.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function signal(title, snippet = "") {
  return {
    source_platform: "naver_blog",
    external_content_id: title,
    raw_text: [title, snippet].filter(Boolean).join("\n\n"),
    source_metadata: { provider_title: title, provider_description: snippet },
  };
}

test("discovery prefilter is versioned and only makes continue/reject decisions", () => {
  assert.equal(DISCOVERY_PREFILTER_VERSION, "source-discovery-prefilter-v0.1");
  const result = classifyDiscoverySignal(signal("평범한 일상 기록", "오늘 있었던 일을 적었습니다."));
  assert.equal(result.decision, "continue");
  assert.equal(result.authority, "high_recall_hard_reject_only");
});

test("lived or strongly explicit friction survives even when a title looks informational", () => {
  assert.equal(classifyDiscoverySignal(signal(
    "환불 안됨 해결 방법 정리",
    "제가 한 달째 환불 못 받고 고객센터에 전화했는데 답이 없었습니다.",
  )).decision, "continue");
  assert.equal(classifyDiscoverySignal(signal(
    "예약 오류 가이드",
    "예약 오류 때문에 결제가 두 번 됐습니다.",
  )).decision, "continue");
});

test("obvious guide, sales, commercial and positive-only noise is rejected before persistence", () => {
  assert.deepEqual(classifyDiscoverySignal(signal("환불 규정 총정리", "환불 신청 방법과 기준을 정리합니다.")).reason_codes, ["obvious_informational_guide"]);
  assert.deepEqual(classifyDiscoverySignal(signal("콘서트 티켓 원가 양도합니다", "좋은 자리입니다.")).reason_codes, ["obvious_sales_listing"]);
  assert.deepEqual(classifyDiscoverySignal(signal("이번 주말 맛집 할인 이벤트", "쿠폰 혜택을 확인하세요.")).reason_codes, ["obvious_commercial_content"]);
  assert.deepEqual(classifyDiscoverySignal(signal("호텔 정말 좋았어요", "깔끔했고 편했습니다.")).reason_codes, ["positive_content_without_friction"]);
});

test("ambiguous report-style material is retained for later provenance/Source Admission decisions", () => {
  const result = classifyDiscoverySignal(signal(
    "어린이 재활 치료 대기 문제",
    "치료 대기 명단이 길어지고 있다는 보도입니다.",
  ));
  assert.equal(result.decision, "continue");
});

test("discovery filtering returns aggregate telemetry without retaining rejected source bodies", () => {
  const result = filterDiscoverySignals([
    signal("환불 규정 총정리", "신청 방법 안내"),
    signal("숙소 예약 취소 당했어요", "제가 예약했는데 일방적으로 취소됐습니다."),
    signal("티켓 팝니다", "판매합니다"),
  ]);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.continue_count, 1);
  assert.equal(result.summary.reject_count, 2);
  assert.equal(result.summary.reason_counts.obvious_informational_guide, 1);
  assert.equal(result.summary.reason_counts.obvious_sales_listing, 1);
  assert.equal(Object.hasOwn(result.rejected[0], "raw_text"), false);
});

test("query plan expands 12 domains across 8 families and 2 subjects without duplicate query keys", () => {
  const plan = buildDiscoveryQueryPlan();
  const summary = getDiscoveryQueryPlanSummary();
  assert.equal(DISCOVERY_QUERY_PLAN_VERSION, "source-discovery-plan-v0.1");
  assert.equal(plan.length, 192);
  assert.equal(summary.query_count, 192);
  assert.equal(summary.result_opportunity_count, 9600);
  assert.equal(summary.domain_count, 12);
  assert.equal(summary.family_count, 8);
  assert.equal(new Set(plan.map((item) => item.query_key)).size, plan.length);
  assert.ok(plan.every((item) => item.input.limit === 50));
  assert.ok(plan.every((item) => item.input.request_metadata.discovery_campaign_version === DISCOVERY_QUERY_PLAN_VERSION));
});

test("first exploration budget is domain-balanced instead of exhausting one query family", () => {
  const selected = selectDiscoveryRequestBudget(buildDiscoveryQueryPlan(), [], { maxRequests: 24 });
  assert.equal(selected.length, 24);
  assert.equal(new Set(selected.map((item) => item.domain)).size, 12);
  const perDomain = new Map();
  for (const item of selected) perDomain.set(item.domain, (perDomain.get(item.domain) ?? 0) + 1);
  assert.ok([...perDomain.values()].every((count) => count === 2));
});

test("yield scoring rewards new candidate-bearing supply and penalizes duplicate-heavy runs", () => {
  const productive = scoreDiscoveryRunMetrics({
    completed_runs: 2,
    fetched_count: 100,
    discovery_continue_count: 70,
    discovery_reject_count: 30,
    inserted_count: 60,
    duplicate_count: 10,
    admission_candidate_count: 15,
  });
  const stale = scoreDiscoveryRunMetrics({
    completed_runs: 2,
    fetched_count: 100,
    discovery_continue_count: 90,
    discovery_reject_count: 10,
    inserted_count: 5,
    duplicate_count: 85,
    admission_candidate_count: 1,
  });
  assert.ok(productive.score > stale.score);
});

test("runtime routes apply discovery filtering before persistence while legacy Gold remains on historical persistence path", async () => {
  const [naverRoute, threadsRoute, goldRunner, service] = await Promise.all([
    read("app/api/radar/admin/sources/naver/blog/search/route.js"),
    read("app/api/radar/admin/sources/threads/search/route.js"),
    read("scripts/run-gold-acquisition-campaign.mjs"),
    read("lib/sources/service.mjs"),
  ]);
  assert.match(naverRoute, /persistDiscoveredSourceSignals/);
  assert.match(threadsRoute, /persistDiscoveredSourceSignals/);
  assert.match(service, /filterDiscoverySignals/);
  assert.match(service, /admission_candidate_count/);
  assert.match(goldRunner, /persistSourceSignals/);
  assert.doesNotMatch(goldRunner, /persistDiscoveredSourceSignals/);
});

test("migration stores cheap-filter and admission yield telemetry without adding a public data surface", async () => {
  const migration = await read("supabase/migrations/032_source_discovery_telemetry.sql");
  assert.match(migration, /discovery_policy_version/);
  assert.match(migration, /discovery_continue_count/);
  assert.match(migration, /discovery_reject_count/);
  assert.match(migration, /discovery_reason_counts jsonb/);
  assert.match(migration, /admission_candidate_count/);
  assert.match(migration, /ar_idx_source_ingestion_runs_discovery_query/);
  assert.doesNotMatch(migration, /ar_public_problem_feed|grant select.*anon/i);
});

test("live discovery runner is explicit opt-in and preserves downstream/Blind boundaries", async () => {
  const [runner, pkg] = await Promise.all([
    read("scripts/run-source-discovery-campaign.mjs"),
    read("package.json"),
  ]);
  assert.match(runner, /ALLOW_SOURCE_DISCOVERY_EXPANSION/);
  assert.match(runner, /--live/);
  assert.match(runner, /snapshotDownstreamBoundaries/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /blind_120_reads: 0/);
  assert.doesNotMatch(runner, /blind-evaluation/);
  assert.match(pkg, /acquire:discovery:plan/);
  assert.match(pkg, /acquire:discovery:live/);
  assert.match(pkg, /run-source-discovery-campaign\.mjs/);
});
