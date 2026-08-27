import {
  PHASE15_9B_SEED_CONTENT_SHA256,
  PHASE15_9B_SEED_IDENTITY_SHA256,
} from "./phase15-9b-targeted-telecom-plan.mjs";

export const PHASE15_9C_VERSION = "phase15.9c-expanded-telecom-search-v0.1";
export const PHASE15_9C_CAMPAIGN_VERSION = PHASE15_9C_VERSION;
export const PHASE15_9C_SOURCE_PLATFORM = "naver_blog";
export const PHASE15_9C_QUERY_LIMIT = 50;
export const PHASE15_9C_MAX_REQUESTS = 8;
export const PHASE15_9C_SEED_IDENTITY_SHA256 = PHASE15_9B_SEED_IDENTITY_SHA256;
export const PHASE15_9C_SEED_CONTENT_SHA256 = PHASE15_9B_SEED_CONTENT_SHA256;

const QUERIES = Object.freeze([
  "알뜰폰 번호이동 안됨",
  "번호이동 제한 해제",
  "번호이동 제한서비스",
  "번호이동 제한서비스 해지",
  "번호이동 제한서비스 해제",
  "번호이동 차단",
  "번호이동 막힘",
  "알뜰폰 번호이동 제한",
]);

export function buildPhase15_9CExpandedPlan() {
  if (QUERIES.length !== PHASE15_9C_MAX_REQUESTS) {
    throw new Error(`Phase 15.9C requires exactly ${PHASE15_9C_MAX_REQUESTS} frozen queries`);
  }
  return QUERIES.map((q, index) => {
    const queryKey = `telecom_port_restriction_expanded__${String(index + 1).padStart(2, "0")}`;
    return {
      query_key: queryKey,
      input: {
        q,
        sort: "sim",
        start: 1,
        limit: PHASE15_9C_QUERY_LIMIT,
        search_type: "TOP",
        search_mode: "KEYWORD",
        since: null,
        until: null,
        request_metadata: {
          provider: "naver_api_hub",
          resource: "blog_search",
          sort: "sim",
          start: 1,
          display: PHASE15_9C_QUERY_LIMIT,
          expanded_campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
          expanded_query_key: queryKey,
          expanded_search_focus: "telecom_port_restriction",
          search_focus_authority: "search_focus_not_problem_signature",
          expansion_reason: "phase15.9b_zero_candidate_broaden_vocabulary_and_relevance_sort",
          protected_seed_identity_sha256: PHASE15_9C_SEED_IDENTITY_SHA256,
        },
      },
    };
  });
}

export function getPhase15_9CPlanSummary() {
  const plan = buildPhase15_9CExpandedPlan();
  return {
    version: PHASE15_9C_VERSION,
    campaign_version: PHASE15_9C_CAMPAIGN_VERSION,
    source_platform: PHASE15_9C_SOURCE_PLATFORM,
    query_count: plan.length,
    max_requests: PHASE15_9C_MAX_REQUESTS,
    result_opportunity_count: plan.length * PHASE15_9C_QUERY_LIMIT,
    search_focus_authority: "search_focus_not_problem_signature",
    expansion_axis: "shorter_queries_plus_similarity_sort",
    protected_seed_upsert: false,
  };
}
