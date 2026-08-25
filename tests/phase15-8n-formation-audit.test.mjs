import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSourceProblemFormationJudgeRequest,
  judgeSourceProblemFormationSemantics,
  resolveSourceProblemFormationAudit,
  SourceProblemFormationObserverError,
  SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION,
} from "../lib/sources/source-problem-formation-observer.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const fullText = "예약 누락 때문에 현지 호텔에서 방이 없다는 안내를 받고 고객센터에 여러 번 연락했습니다.";

function semantic(overrides = {}) {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
    evidence_quote: "예약 누락 때문에 현지 호텔에서 방이 없다는 안내를 받고 고객센터에 여러 번 연락했습니다.",
    problem_mechanism_proposal: "booking inventory synchronization failure",
    incident_summary_proposal: "one traveler arrived after a booking omission and had to contact support repeatedly",
    ...overrides,
  };
}

function resolvedContext() {
  return {
    status: "resolved",
    title: "예약 누락 피해 후기",
    content_text: fullText,
    content_hash: "a".repeat(64),
    original_char_count: fullText.length,
    truncated: false,
    content_scope: "full_post",
  };
}

test("15.8N observer is semantic-only and explicitly denies downstream authority", () => {
  assert.equal(SOURCE_PROBLEM_FORMATION_OBSERVER_VERSION, "source-problem-formation-observer-v0.1");
  const request = buildSourceProblemFormationJudgeRequest({
    title: "test",
    fullText,
    sourcePlatform: "naver_blog",
    model: "test-model",
  });
  assert.equal(request.body.store, false);
  assert.match(request.body.instructions, /Do not decide formation eligibility, incident identity, problem identity, publication/);
  assert.match(request.body.instructions, /advertisement includes sponsored promotion, affiliate\/lead-generation content/);
  assert.match(request.body.instructions, /source_origin=original/);
  assert.match(request.body.instructions, /Do not create an incident key or canonical Problem name/);
});

test("grounded original first-hand friction remains eligible under existing deterministic Formation authority", async () => {
  const result = await resolveSourceProblemFormationAudit({ source_platform: "naver_blog" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async () => semantic(),
  });
  assert.equal(result.formation_state, "eligible");
  assert.equal(result.resolved, true);
});

test("formation audit independently catches promotional and derivative surfaces", async () => {
  const advertisement = await resolveSourceProblemFormationAudit({ source_platform: "naver_blog" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async () => semantic({ content_kind: "advertisement" }),
  });
  assert.equal(advertisement.formation_state, "reject");
  assert.deepEqual(advertisement.reason_codes, ["formation_non_evidence_content"]);

  const derivative = await resolveSourceProblemFormationAudit({ source_platform: "naver_blog" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async () => semantic({ source_origin: "derivative" }),
  });
  assert.equal(derivative.formation_state, "provenance_review");
  assert.deepEqual(derivative.reason_codes, ["formation_original_source_required"]);
});

test("only provider-incomplete receives one bounded semantic retry", async () => {
  let calls = 0;
  const result = await resolveSourceProblemFormationAudit({ source_platform: "naver_blog" }, {
    fetchContext: async () => resolvedContext(),
    judgeContext: async () => {
      calls += 1;
      if (calls === 1) {
        throw new SourceProblemFormationObserverError(
          "source_formation_provider_incomplete",
          "incomplete",
          { retryable: true },
        );
      }
      return semantic();
    },
    maxSemanticAttempts: 2,
  });
  assert.equal(calls, 2);
  assert.equal(result.formation_state, "eligible");
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.recovered, true);
  assert.equal(result.recovery.attempt_count, 2);
});

test("formation evidence quote must be an exact contiguous excerpt", async () => {
  const payload = {
    status: "completed",
    model: "test-model",
    output: [{
      content: [{
        type: "output_text",
        text: JSON.stringify(semantic({ evidence_quote: "본문에 없는 인용문" })),
      }],
    }],
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  });
  await assert.rejects(
    judgeSourceProblemFormationSemantics({
      title: "test",
      fullText,
      sourcePlatform: "naver_blog",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    }),
    /exact excerpt/,
  );
});

test("15.8N runner freezes the exact M-B Candidate authority and remains DB read-only", async () => {
  const script = await read("scripts/run-source-problem-formation-audit-15-8n.mjs");
  assert.match(script, /SOURCE_BATCH_VERSION = "phase15\.8m-b-remainder-v0\.1"/);
  assert.match(script, /EXPECTED_BATCH_ROWS = 82/);
  assert.match(script, /EXPECTED_CANDIDATES = 8/);
  assert.match(script, /EXPECTED_REJECTS = 66/);
  assert.match(script, /EXPECTED_UNRESOLVED_REVIEWS = 8/);
  assert.match(script, /aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.rpc\(/);
});

test("15.8N disposable artifact excludes full body and routing identity while preserving curator audit evidence", async () => {
  const script = await read("scripts/run-source-problem-formation-audit-15-8n.mjs");
  assert.match(script, /evidence_quote: semantic\.evidence_quote/);
  assert.match(script, /problem_mechanism: semantic\.problem_mechanism_proposal/);
  assert.match(script, /incident_summary: semantic\.incident_summary_proposal/);
  assert.match(script, /"content_text", "canonical_url", "fetched_url", "author_handle", "provider_request_id"/);
  assert.match(script, /empirical_formation_audit_not_runtime_truth/);
  assert.match(script, /incident_identity_assigned: false/);
  assert.match(script, /repeated_problem_clusters_asserted: false/);
});

test("15.8N workflow is bounded to authoritative main and one temporary live trigger", async () => {
  const workflow = await read(".github/workflows/source-problem-formation-audit-15-8n.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8n-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FORMATION: "true"/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /run-source-problem-formation-audit-15-8n\.mjs --live/);
  assert.doesNotMatch(workflow, /agent\/phase15-8n-formation-audit/);
});
