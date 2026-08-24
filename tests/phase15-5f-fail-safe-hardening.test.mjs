import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveFullContextSemantic,
  resolveSourceAdmissionWithFullContext,
} from "../lib/sources/source-full-context-resolution.mjs";

function reviewSignal() {
  return {
    id: "review-hardening",
    source_platform: "naver_blog",
    canonical_url: "https://blog.naver.com/example/224383414011",
    author_handle: "개인 블로거",
    raw_text: "여기어때 오키나와 숙소 태풍 결항 환불 후기\n\n무사히 환불 끝냈으니 내년 여행을 노려봐야겠다.",
    source_metadata: {
      provider_title: "여기어때 오키나와 숙소 태풍 결항 환불 후기",
      provider_description: "무사히 환불 끝냈으니 내년 여행을 노려봐야겠다.",
    },
  };
}

const fetched = {
  status: "resolved",
  title: "환불 후기",
  content_text: "환불 처리가 지연되어 여러 차례 문의했습니다. 이후 환불을 받았습니다.",
  content_scope: "full_post",
  error_code: null,
};

test("general informational or how-to content cannot be promoted by full-context resolution", () => {
  const result = resolveFullContextSemantic({
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "informational",
    evidence_quote: null,
  });

  assert.equal(result.decision, "reject");
  assert.equal(result.resolved, true);
  assert.deepEqual(result.reason_codes, ["full_context_informational_content"]);
});

test("an unexpected full-context fetch exception preserves REVIEW", async () => {
  const result = await resolveSourceAdmissionWithFullContext(reviewSignal(), {
    fetchContext: async () => {
      const error = new Error("unexpected fetch failure");
      error.code = "test_fetch_failure";
      throw error;
    },
    judgeContext: async () => assert.fail("judge must not run after fetch failure"),
  });

  assert.equal(result.decision, "review");
  assert.equal(result.status, "unresolved");
  assert.equal(result.resolved, false);
  assert.deepEqual(result.reason_codes, ["test_fetch_failure"]);
});

test("missing semantic provider configuration preserves REVIEW after a successful fetch", async () => {
  const result = await resolveSourceAdmissionWithFullContext(reviewSignal(), {
    fetchContext: async () => fetched,
    env: {},
  });

  assert.equal(result.decision, "review");
  assert.equal(result.status, "unresolved");
  assert.equal(result.resolved, false);
  assert.deepEqual(result.reason_codes, ["source_full_context_llm_not_configured"]);
});
