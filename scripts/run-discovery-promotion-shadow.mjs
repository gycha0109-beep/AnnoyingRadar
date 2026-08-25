import { createServiceClient } from "../lib/supabase/service.js";
import { buildDiscoveryQueryPlan } from "../lib/sources/discovery-query-plan.mjs";
import { listDiscoveryQueryMetrics } from "../lib/sources/service.mjs";
import {
  buildPromotionShadowRanking,
  summarizePromotionShadow,
} from "../lib/sources/discovery-promotion-shadow.mjs";
import {
  REVIEW_PROMOTION_CALIBRATION_VERSION,
  REVIEW_PROMOTION_EMPIRICAL_BASELINE,
  REVIEW_PROMOTION_SHADOW_VERSION,
} from "../lib/sources/review-promotion-calibration.mjs";

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
      exact_runs: row.exact_runs,
      review_count: row.review_count,
      base_score: row.base_score,
      shadow_score: row.shadow_score,
      score_delta: row.score_delta,
      base_exploitation_eligible: row.base_exploitation_eligible,
      shadow_exploitation_eligible: row.shadow_exploitation_eligible,
      calibrated_promotion_rate: row.calibration.calibrated_promotion_rate,
      calibration_scope: row.calibration.scope,
    }));
}

async function main() {
  const client = createServiceClient();
  const metrics = await listDiscoveryQueryMetrics(client);
  const plan = buildDiscoveryQueryPlan();
  const ranking = buildPromotionShadowRanking(plan, metrics);
  const summary = summarizePromotionShadow(ranking);

  console.log(JSON.stringify({
    status: "SHADOW_ONLY",
    calibration_version: REVIEW_PROMOTION_CALIBRATION_VERSION,
    shadow_version: REVIEW_PROMOTION_SHADOW_VERSION,
    empirical_baseline: REVIEW_PROMOTION_EMPIRICAL_BASELINE,
    summary,
    top_changed_queries: topChangedRows(ranking),
    active_allocation_mutated: false,
    database_writes: 0,
    blind_evaluation_reads: 0,
    full_source_body_fetches: 0,
    publication_mutations: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[promotion-shadow] FAILED: ${error.name}: ${error.message}`);
  if (error?.code) console.error(JSON.stringify({ code: error.code }, null, 2));
  process.exitCode = 1;
});
