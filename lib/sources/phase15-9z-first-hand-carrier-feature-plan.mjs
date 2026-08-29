export const PHASE15_9Z_VERSION = "phase15.9z-first-hand-carrier-feature-search-v0.1";
export const PHASE15_9Z_CAMPAIGN_VERSION = PHASE15_9Z_VERSION;
export const PHASE15_9Z_SOURCE_PLATFORM = "naver_blog";
export const PHASE15_9Z_QUERY_LIMIT = 50;
export const PHASE15_9Z_MAX_REQUESTS = 8;
export const PHASE15_9Z_PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";

const QUERIES = Object.freeze([
  "자급제 채팅플러스 안됨 후기",
  "자급제폰 채팅플러스 안됨 경험",
  "자급제 투폰 안됨 후기",
  "자급제 넘버플러스 최악",
  "자급제폰 부가서비스 안됨 후기",
  "통신사 부가서비스 자급제 불편 후기",
  "CSC 변경 채팅플러스 비추천",
  "CSC 변경 투폰 불편 후기",
]);

export function buildPhase15_9ZFirstHandCarrierFeaturePlan() {
  if (QUERIES.length !== PHASE15_9Z_MAX_REQUESTS) {
    throw new Error(`Phase 15.9Z requires exactly ${PHASE15_9Z_MAX_REQUESTS} frozen queries`);
  }

  return QUERIES.map((q, index) => {
    const queryKey = `first_hand_carrier_feature__${String(index + 1).padStart(2, "0")}`;
    return {
      query_key: queryKey,
      input: {
        q,
        sort: "sim",
        start: 1,
        limit: PHASE15_9Z_QUERY_LIMIT,
        search_type: "TOP",
        search_mode: "KEYWORD",
        since: null,
        until: null,
        request_metadata: {
          provider: "naver_api_hub",
          resource: "blog_search",
          sort: "sim",
          start: 1,
          display: PHASE15_9Z_QUERY_LIMIT,
          first_hand_carrier_feature_campaign_version: PHASE15_9Z_CAMPAIGN_VERSION,
          first_hand_carrier_feature_query_key: queryKey,
          search_focus: "first_hand_carrier_feature_restriction",
          search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
          acquisition_reason: "second_distinct_incident_required_before_public_problem_draft",
          protected_incident_key: PHASE15_9Z_PROTECTED_INCIDENT_KEY,
        },
      },
    };
  });
}

export function getPhase15_9ZFirstHandCarrierFeaturePlanSummary() {
  const plan = buildPhase15_9ZFirstHandCarrierFeaturePlan();
  return {
    version: PHASE15_9Z_VERSION,
    campaign_version: PHASE15_9Z_CAMPAIGN_VERSION,
    source_platform: PHASE15_9Z_SOURCE_PLATFORM,
    query_count: plan.length,
    max_requests: PHASE15_9Z_MAX_REQUESTS,
    result_opportunity_count: plan.length * PHASE15_9Z_QUERY_LIMIT,
    search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
    acquisition_goal: "find_distinct_first_hand_episode_for_second_incident_path",
  };
}
