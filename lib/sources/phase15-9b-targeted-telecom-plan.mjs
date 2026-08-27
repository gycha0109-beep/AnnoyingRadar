import { PHASE15_9A_ACQUISITION_FOCUS, PHASE15_9A_PRIMARY_SEED } from "./phase15-9a-seed-authority.mjs";

export const PHASE15_9B_VERSION = "phase15.9b-targeted-telecom-acquisition-v0.1";
export const PHASE15_9B_CAMPAIGN_VERSION = PHASE15_9B_VERSION;
export const PHASE15_9B_SOURCE_PLATFORM = "naver_blog";
export const PHASE15_9B_QUERY_LIMIT = 50;
export const PHASE15_9B_MAX_REQUESTS = 4;

export const PHASE15_9B_SEED_IDENTITY_SHA256 = PHASE15_9A_PRIMARY_SEED.source_identity_sha256;

export function buildPhase15_9BTargetedPlan() {
  const queries = [...PHASE15_9A_ACQUISITION_FOCUS.query_terms];
  if (queries.length !== PHASE15_9B_MAX_REQUESTS) {
    throw new Error(`Phase 15.9B requires exactly ${PHASE15_9B_MAX_REQUESTS} frozen queries`);
  }

  return queries.map((q, index) => {
    const queryKey = `telecom_port_restriction__${String(index + 1).padStart(2, "0")}`;
    return {
      query_key: queryKey,
      search_focus: PHASE15_9A_ACQUISITION_FOCUS.mechanism_description,
      input: {
        q,
        sort: "date",
        start: 1,
        limit: PHASE15_9B_QUERY_LIMIT,
        search_type: "RECENT",
        search_mode: "KEYWORD",
        since: null,
        until: null,
        request_metadata: {
          provider: "naver_api_hub",
          resource: "blog_search",
          sort: "date",
          start: 1,
          display: PHASE15_9B_QUERY_LIMIT,
          targeted_campaign_version: PHASE15_9B_CAMPAIGN_VERSION,
          targeted_query_key: queryKey,
          targeted_search_focus: "telecom_port_restriction",
          search_focus_authority: "search_focus_not_problem_signature",
        },
      },
    };
  });
}

export function getPhase15_9BPlanSummary() {
  const plan = buildPhase15_9BTargetedPlan();
  return {
    version: PHASE15_9B_VERSION,
    campaign_version: PHASE15_9B_CAMPAIGN_VERSION,
    source_platform: PHASE15_9B_SOURCE_PLATFORM,
    query_count: plan.length,
    max_requests: PHASE15_9B_MAX_REQUESTS,
    result_opportunity_count: plan.length * PHASE15_9B_QUERY_LIMIT,
    search_focus_authority: "search_focus_not_problem_signature",
  };
}
