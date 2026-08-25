import { createServiceClient } from "../lib/supabase/service.js";
import { buildDiscoveryQueryPlan } from "../lib/sources/discovery-query-plan.mjs";
import { listDiscoveryQueryMetrics } from "../lib/sources/service.mjs";
import {
  buildCombinedPromotionShadowRanking,
  summarizeCombinedPromotionShadow,
} from "../lib/sources/discovery-combined-promotion-shadow.mjs";
import {
  COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION,
  COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE,
  COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
  COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
} from "../lib/sources/combined-review-promotion-calibration.mjs";

const EXPECTED_EXACT_RUNS = 24;
const EXPECTED_EXACT_NEW_SOURCES = 961;
const EXPECTED_EXACT_NEW_REVIEWS = 166;
const EXPECTED_QUERY_PLAN_SIZE = 192;

function topChangedRows(ranking, limit = 20) {
  return ranking
    .filter((row) => row.completed_runs > 0)
    .sort((left, right) => {
      const delta = Math.abs(right.score_delta) - Math.abs(left.score_delta);
      if (delta !== 0) return delta;
      return left.query_key.localeCompare(right.query_key);
    })
    .slice(0, limit)
    .map((row) => ({
      query_key: row.query_key,
      domain: row.domain,
      family: row.family,
      telemetry_scope: row.telemetry_scope,
      promotion_applicable: row.promotion_applicable,
      exact_runs: row.exact_runs,
      review_count: row.review_count,
      base_score: row.base_score,
      shadow_score: row.shadow_score,
      score_delta: row.score_delta,
      base_exploitation_eligible: row.base_exploitation_eligible,
      shadow_exploitation_eligible: row.shadow_exploitation_eligible,
      calibrated_promotion_rate: row.calibration?.calibrated_promotion_rate ?? null,
      calibration_scope: row.calibration?.scope ?? null,
    }));
}

function assertFrozenExactAuthority(summary) {
  const exact = summary.exact_authority_totals;
  const mismatches = [];
  if (summary.total_queries !== EXPECTED_QUERY_PLAN_SIZE) {
    mismatches.push(`query plan ${summary.total_queries} != ${EXPECTED_QUERY_PLAN_SIZE}`);
  }
  if (exact.exact_runs !== EXPECTED_EXACT_RUNS) {
    mismatches.push(`exact runs ${exact.exact_runs} != ${EXPECTED_EXACT_RUNS}`);
  }
  if (exact.exact_new_sources !== EXPECTED_EXACT_NEW_SOURCES) {
    mismatches.push(`exact-new Sources ${exact.exact_new_sources} != ${EXPECTED_EXACT_NEW_SOURCES}`);
  }
  if (exact.exact_new_reviews !== EXPECTED_EXACT_NEW_REVIEWS) {
    mismatches.push(`exact-new Reviews ${exact.exact_new_reviews} != ${EXPECTED_EXACT_NEW_REVIEWS}`);
  }
  if (mismatches.length > 0) {
    const error = new Error(`Phase 15.8I frozen exact telemetry authority drifted: ${mismatches.join("; ")}`);
    error.code = "phase15_8i_exact_authority_drift";
    throw error;
  }
}

async function main() {
  const client = createServiceClient();
  const metrics = await listDiscoveryQueryMetrics(client);
  const plan = buildDiscoveryQueryPlan();
  const ranking = buildCombinedPromotionShadowRanking(plan, metrics);
  const summary = summarizeCombinedPromotionShadow(ranking);

  assertFrozenExactAuthority(summary);

  console.log(JSON.stringify({
    status: "SHADOW_ONLY",
    phase: "15.8I",
    calibration_version: COMBINED_REVIEW_PROMOTION_CALIBRATION_VERSION,
    shadow_version: COMBINED_REVIEW_PROMOTION_SHADOW_VERSION,
    calibration_authority_scope: "new_source_exact_only",
    calibration_method_change: false,
    prior_strength: COMBINED_REVIEW_PROMOTION_PRIOR_STRENGTH,
    reliability_reruns_used_as_replacement_labels: false,
    empirical_baseline: COMBINED_REVIEW_PROMOTION_EMPIRICAL_BASELINE,
    frozen_exact_authority: {
      exact_runs: EXPECTED_EXACT_RUNS,
      exact_new_sources: EXPECTED_EXACT_NEW_SOURCES,
      exact_new_reviews: EXPECTED_EXACT_NEW_REVIEWS,
    },
    summary,
    top_changed_queries: topChangedRows(ranking),
    active_allocation_version: "source-discovery-allocation-v0.4",
    active_allocation_mutated: false,
    database_writes: 0,
    blind_evaluation_reads: 0,
    full_source_body_fetches: 0,
    semantic_provider_calls: 0,
    publication_mutations: 0,
    formation_mutations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[combined-promotion-shadow] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
