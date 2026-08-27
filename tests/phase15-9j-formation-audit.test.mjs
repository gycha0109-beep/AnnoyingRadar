import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_9JArtifactItem,
  PHASE15_9J_EXPECTED_OUTCOME_TOTAL,
  PHASE15_9J_MAX_MODEL_CALLS,
  PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS,
  PHASE15_9J_SOURCE_BATCH_VERSION,
  PHASE15_9J_TARGET_COUNT,
  PHASE15_9J_TARGET_ORDINALS,
  validatePhase15_9JOutcomeAuthority,
} from "../lib/sources/phase15-9j-formation-audit.mjs";
import {
  PHASE15_9I_CANDIDATE_AUTHORITY,
} from "../lib/sources/phase15-9i-confirmed-fn-outcome-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function durableRow(ordinal) {
  const authority = PHASE15_9I_CANDIDATE_AUTHORITY[ordinal];
  return {
    source_signal_id: `source-${ordinal}`,
    status: "resolved",
    decision: "candidate",
    reason_codes: ["full_context_first_hand_external_friction"],
    ...authority.semantic,
    context_status: "resolved",
    context_scope: "full_post",
    context_content_sha256: authority.context_hash,
    context_char_count: authority.context_chars,
    context_truncated: false,
  };
}

test("15.9J freezes the exact durable 15.9I Candidate authority and bounded cost", () => {
  assert.equal(PHASE15_9J_SOURCE_BATCH_VERSION, "phase15.9i-confirmed-false-negative-candidates-v0.1");
  assert.deepEqual(PHASE15_9J_TARGET_ORDINALS, [4, 9, 16]);
  assert.equal(PHASE15_9J_TARGET_COUNT, 3);
  assert.equal(PHASE15_9J_EXPECTED_OUTCOME_TOTAL, 85);
  assert.equal(PHASE15_9J_MAX_SOURCE_NETWORK_REQUESTS, 24);
  assert.equal(PHASE15_9J_MAX_MODEL_CALLS, 6);

  const validated = validatePhase15_9JOutcomeAuthority([durableRow(16), durableRow(4), durableRow(9)]);
  assert.deepEqual(validated.map((item) => item.baseline_ordinal), [4, 9, 16]);
  assert.deepEqual(validated.map((item) => item.source_signal_id), ["source-4", "source-9", "source-16"]);
});

test("15.9J durable authority validation fails closed on semantic or context drift", () => {
  const semanticDrift = durableRow(4);
  semanticDrift.content_kind = "informational";
  assert.throws(
    () => validatePhase15_9JOutcomeAuthority([semanticDrift, durableRow(9), durableRow(16)]),
    /content_kind drifted/,
  );

  const contextDrift = durableRow(9);
  contextDrift.context_char_count += 1;
  assert.throws(
    () => validatePhase15_9JOutcomeAuthority([durableRow(4), contextDrift, durableRow(16)]),
    /context_char_count drifted/,
  );
});

test("15.9J artifact hashes the exact Formation evidence quote instead of emitting it", () => {
  const target = {
    baseline_ordinal: 4,
    h_authority: PHASE15_9I_CANDIDATE_AUTHORITY[4],
  };
  const context = { status: "resolved", content_scope: "full_post", content_text: "before exact friction quote after", content_hash: "hash", original_char_count: 33, extraction_scope: "main_element", truncated: false };
  const item = buildPhase15_9JArtifactItem({
    target,
    context,
    formationResult: {
      formation_state: "eligible",
      resolved: true,
      reason_codes: ["formation_grounded_external_friction"],
      semantic: {
        problem_claim: "yes",
        experience_actor: "self",
        friction_specificity: "concrete",
        pain_centrality: "central",
        content_kind: "organic",
        source_origin: "original",
        friction_responsibility: "external_service_or_product",
        evidence_quote: "exact friction quote",
        problem_mechanism_proposal: "repeatable mechanism",
        incident_summary_proposal: "one episode",
      },
      recovery: { attempted: false, recovered: false, attempt_count: 1, trigger_reason_code: null },
    },
  });

  assert.equal(item.formation_state, "eligible");
  assert.equal(item.formation_semantic.evidence_quote_grounded, true);
  assert.equal(item.formation_semantic.evidence_quote_char_count, "exact friction quote".length);
  assert.equal("evidence_quote" in item.formation_semantic, false);
  assert.equal(JSON.stringify(item).includes("exact friction quote"), false);
  assert.equal("source_signal_id" in item, false);
});

test("15.9J runner is Blind-safe, external-context-bound, actual-origin-aware, and DB read-only", async () => {
  const script = await read("scripts/run-durable-candidate-formation-audit-15-9j.mjs");

  assert.match(script, /loadPhase15_9IOutcomes/);
  assert.match(script, /validatePhase15_9JOutcomeAuthority/);
  assert.match(script, /getEvaluationSampleIds/);
  assert.match(script, /blindOverlap.*0/);
  assert.match(script, /loadTargetSignals/);
  assert.ok(script.indexOf("getEvaluationSampleIds") < script.lastIndexOf("loadTargetSignals"));
  assert.match(script, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(script, /assertPhase15_9JContextIntegrity/);
  assert.match(script, /comparePhase15_9GFetches/);
  assert.match(script, /sourcePlatform: origin\.kind/);
  assert.match(script, /resolveSourceProblemFormationAudit/);
  assert.match(script, /maxSemanticAttempts: 2/);
  assert.match(script, /source_formation_provider_incomplete/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /incident_identity_assigned: false/);
  assert.match(script, /problem_signature_assigned: false/);
  assert.match(script, /publication_authority_granted: false/);

  assert.doesNotMatch(script, /\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(script, /\bclient\s*\.rpc\(/);
});

test("15.9J workflow is authoritative-main and isolates any temporary live push trigger", async () => {
  const workflow = await read(".github/workflows/source-durable-candidate-formation-audit-15-9j.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9J_FORMATION_AUDIT: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /gpt-5-mini-2025-08-07/);
  assert.match(workflow, /retention-days: 1/);

  const pushBranch = /push:\s*\n\s*branches:\s*\n\s*-\s*([^\s]+)/.exec(workflow)?.[1] ?? null;
  if (pushBranch !== null) assert.equal(pushBranch, "agent/phase15-9j-live-execution");
});
