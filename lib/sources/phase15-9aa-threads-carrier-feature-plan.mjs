export const PHASE15_9AA_VERSION = "phase15.9aa-threads-carrier-feature-acquisition-v0.1";
export const PHASE15_9AA_CAMPAIGN_VERSION = PHASE15_9AA_VERSION;
export const PHASE15_9AA_SOURCE_PLATFORM = "threads";
export const PHASE15_9AA_QUERY_LIMIT = 50;
export const PHASE15_9AA_MAX_REQUESTS = 8;
export const PHASE15_9AA_PROTECTED_INCIDENT_KEY = "carrier_csc_feature_restriction_case";

const QUERY_PAIRS = Object.freeze([
  "자급제 채팅플러스",
  "자급제 투폰",
  "자급제 넘버플러스",
  "CSC 변경 기능",
]);

export function buildPhase15_9AAThreadsCarrierFeaturePlan() {
  const plan = [];
  for (const q of QUERY_PAIRS) {
    for (const searchType of ["TOP", "RECENT"]) {
      const queryKey = `threads_carrier_feature__${String(plan.length + 1).padStart(2, "0")}`;
      plan.push({
        query_key: queryKey,
        input: {
          q,
          search_type: searchType,
          search_mode: "KEYWORD",
          limit: PHASE15_9AA_QUERY_LIMIT,
          since: null,
          until: null,
          request_metadata: {
            provider: "threads",
            resource: "keyword_search",
            search_type: searchType,
            search_mode: "KEYWORD",
            limit: PHASE15_9AA_QUERY_LIMIT,
            threads_carrier_feature_campaign_version: PHASE15_9AA_CAMPAIGN_VERSION,
            threads_carrier_feature_query_key: queryKey,
            search_focus: "first_hand_carrier_feature_restriction",
            search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
            acquisition_reason: "second_distinct_incident_required_before_public_problem_draft",
            protected_incident_key: PHASE15_9AA_PROTECTED_INCIDENT_KEY,
          },
        },
      });
    }
  }
  if (plan.length !== PHASE15_9AA_MAX_REQUESTS) {
    throw new Error(`Phase 15.9AA requires exactly ${PHASE15_9AA_MAX_REQUESTS} frozen requests`);
  }
  return plan;
}

export function getPhase15_9AAThreadsCarrierFeaturePlanSummary() {
  const plan = buildPhase15_9AAThreadsCarrierFeaturePlan();
  return {
    version: PHASE15_9AA_VERSION,
    campaign_version: PHASE15_9AA_CAMPAIGN_VERSION,
    source_platform: PHASE15_9AA_SOURCE_PLATFORM,
    query_count: QUERY_PAIRS.length,
    request_count: plan.length,
    max_requests: PHASE15_9AA_MAX_REQUESTS,
    result_opportunity_count: plan.length * PHASE15_9AA_QUERY_LIMIT,
    search_types: ["TOP", "RECENT"],
    search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
    acquisition_goal: "find_distinct_first_hand_episode_for_second_incident_path",
    canonical_followup_authority: "post_campaign_database_readback",
  };
}
