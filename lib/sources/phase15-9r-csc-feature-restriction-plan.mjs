export const PHASE15_9R_VERSION = "phase15.9r-csc-feature-restriction-search-v0.1";
export const PHASE15_9R_CAMPAIGN_VERSION = PHASE15_9R_VERSION;
export const PHASE15_9R_SOURCE_PLATFORM = "naver_blog";
export const PHASE15_9R_QUERY_LIMIT = 50;
export const PHASE15_9R_MAX_REQUESTS = 8;

export const PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256 =
  "23d6cc83a4110163e077d1eb6d792c1d937402358eddca8567aeb1be0cd37c33";
export const PHASE15_9R_PROTECTED_SOURCE_CONTENT_SHA256 =
  "4f4dc2ac3787800e0ef07685c2aed81dc0455884cca4e662778d5046bd67e179";
export const PHASE15_9R_PROTECTED_DECISION_ID =
  "b58973c3-92ed-4a4a-ad1b-07780881e961";
export const PHASE15_9R_PROTECTED_INCIDENT_KEY =
  "carrier_csc_feature_restriction_case";

const QUERIES = Object.freeze([
  "CSC 변경 채팅플러스 안됨",
  "자급제 CSC 채팅플러스",
  "KOO CSC 채팅플러스",
  "CSC 변경 투폰 안됨",
  "자급제 투폰 안됨",
  "IMEI 채팅플러스 안됨",
  "CSC 변경 RCS 안됨",
  "통신사 CSC 기능 제한",
]);

export function buildPhase15_9RCscFeatureRestrictionPlan() {
  if (QUERIES.length !== PHASE15_9R_MAX_REQUESTS) {
    throw new Error(`Phase 15.9R requires exactly ${PHASE15_9R_MAX_REQUESTS} frozen queries`);
  }

  return QUERIES.map((q, index) => {
    const queryKey = `carrier_csc_feature_restriction__${String(index + 1).padStart(2, "0")}`;
    return {
      query_key: queryKey,
      input: {
        q,
        sort: "sim",
        start: 1,
        limit: PHASE15_9R_QUERY_LIMIT,
        search_type: "TOP",
        search_mode: "KEYWORD",
        since: null,
        until: null,
        request_metadata: {
          provider: "naver_api_hub",
          resource: "blog_search",
          sort: "sim",
          start: 1,
          display: PHASE15_9R_QUERY_LIMIT,
          csc_campaign_version: PHASE15_9R_CAMPAIGN_VERSION,
          csc_query_key: queryKey,
          csc_search_focus: "carrier_csc_feature_restriction",
          search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
          acquisition_reason: "second_independent_incident_required_before_public_problem_draft",
          protected_source_identity_sha256: PHASE15_9R_PROTECTED_SOURCE_IDENTITY_SHA256,
          protected_incident_key: PHASE15_9R_PROTECTED_INCIDENT_KEY,
        },
      },
    };
  });
}

export function getPhase15_9RCscFeatureRestrictionPlanSummary() {
  const plan = buildPhase15_9RCscFeatureRestrictionPlan();
  return {
    version: PHASE15_9R_VERSION,
    campaign_version: PHASE15_9R_CAMPAIGN_VERSION,
    source_platform: PHASE15_9R_SOURCE_PLATFORM,
    query_count: plan.length,
    max_requests: PHASE15_9R_MAX_REQUESTS,
    result_opportunity_count: plan.length * PHASE15_9R_QUERY_LIMIT,
    search_focus_authority: "search_focus_not_problem_signature_or_incident_authority",
    acquisition_goal: "find_second_independent_organic_case",
    protected_seed_upsert: false,
  };
}
