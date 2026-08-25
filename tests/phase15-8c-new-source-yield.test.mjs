import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  scoreDiscoveryRunMetrics,
  DISCOVERY_QUERY_ALLOCATION_VERSION,
  DISCOVERY_MIN_EXPLOITATION_SCORE,
} from "../lib/sources/discovery-query-plan.mjs";
import { NEW_SOURCE_ADMISSION_TELEMETRY_VERSION } from "../lib/sources/service.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15.8C versions exact new-source admission telemetry and allocation v0.4", () => {
  assert.equal(NEW_SOURCE_ADMISSION_TELEMETRY_VERSION, "new-source-admission-yield-v0.1");
  assert.equal(DISCOVERY_QUERY_ALLOCATION_VERSION, "source-discovery-allocation-v0.4");
});

test("exact new-source telemetry overrides duplicate-inflated legacy admission counts", () => {
  const result = scoreDiscoveryRunMetrics({
    completed_runs: 3,
    fetched_count: 150,
    discovery_continue_count: 140,
    discovery_reject_count: 10,
    inserted_count: 60,
    duplicate_count: 80,
    admission_candidate_count: 12,
    admission_review_count: 40,
    admission_reject_count: 88,
    new_telemetry_runs: 1,
    new_telemetry_fetched_count: 50,
    new_telemetry_continue_count: 45,
    new_telemetry_discovery_reject_count: 5,
    new_telemetry_inserted_count: 10,
    new_telemetry_duplicate_count: 35,
    new_admission_candidate_count: 1,
    new_admission_review_count: 2,
    new_admission_reject_count: 7,
  });

  assert.equal(result.telemetry_scope, "new_source_exact");
  assert.equal(result.rates.candidate_rate, 0.1);
  assert.equal(result.rates.review_rate, 0.2);
  assert.equal(result.rates.admission_reject_rate, 0.7);
  assert.equal(result.rates.new_signal_rate, 10 / 45);
});

test("duplicate-only exact run has zero exploitation value even with a full provider page", () => {
  const result = scoreDiscoveryRunMetrics({
    completed_runs: 2,
    fetched_count: 100,
    discovery_continue_count: 90,
    inserted_count: 45,
    duplicate_count: 45,
    admission_candidate_count: 2,
    admission_review_count: 20,
    admission_reject_count: 68,
    new_telemetry_runs: 1,
    new_telemetry_fetched_count: 50,
    new_telemetry_continue_count: 45,
    new_telemetry_discovery_reject_count: 5,
    new_telemetry_inserted_count: 0,
    new_telemetry_duplicate_count: 45,
    new_admission_candidate_count: 0,
    new_admission_review_count: 0,
    new_admission_reject_count: 0,
  });

  assert.equal(result.telemetry_scope, "new_source_exact");
  assert.equal(result.score, 0);
  assert.ok(result.score < DISCOVERY_MIN_EXPLOITATION_SCORE);
  assert.equal(result.rates.duplicate_rate, 1);
});

test("legacy historical runs remain scoreable until exact telemetry exists", () => {
  const result = scoreDiscoveryRunMetrics({
    completed_runs: 1,
    fetched_count: 20,
    discovery_continue_count: 18,
    discovery_reject_count: 2,
    inserted_count: 15,
    duplicate_count: 3,
    admission_candidate_count: 1,
    admission_review_count: 3,
    admission_reject_count: 14,
  });

  assert.equal(result.telemetry_scope, "legacy_run_level");
  assert.equal(result.exploration, false);
});

test("service persists exact admission outcomes only for newly inserted Source identities", async () => {
  const service = await read("lib/sources/service.mjs");
  assert.match(service, /NEW_SOURCE_ADMISSION_TELEMETRY_VERSION/);
  assert.match(service, /const newSignals = uniqueSignals\.filter/);
  assert.match(service, /summarizeSourceAdmissions\(newSignals\)/);
  assert.match(service, /new_admission_candidate_count: newAdmissionSummary\.candidate/);
  assert.match(service, /new_admission_review_count: newAdmissionSummary\.review/);
  assert.match(service, /new_admission_reject_count: newAdmissionSummary\.reject/);
  assert.match(service, /new_telemetry_runs/);
});

test("migration requires exact admission outcome counts to equal inserted Source count", async () => {
  const migration = await read("supabase/migrations/033_new_source_admission_yield_telemetry.sql");
  assert.match(migration, /new_admission_telemetry_version/);
  assert.match(migration, /ar_source_ingestion_runs_new_admission_telemetry_complete/);
  assert.match(migration, /new_admission_candidate_count[\s\S]*new_admission_review_count[\s\S]*new_admission_reject_count[\s\S]*= inserted_count/);
  assert.doesNotMatch(migration, /grant select.*anon|ar_public_problem_feed/i);
});
