import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveSemanticGateDecision,
  needsSecondaryJudge,
  normalizeHumanEvaluationInput,
  normalizeSemanticJudgment,
  resolveSemanticGate,
  semanticJudgmentsAgree,
} from "../lib/sources/semantic-contracts.mjs";
import {
  CHALLENGE_BUCKET_TARGETS,
  EVALUATION_TARGET,
  REPRESENTATIVE_TARGET,
  CHALLENGE_TARGET,
} from "../lib/sources/blind-evaluation.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("semantic facts are independent from final gate eligibility", () => {
  const otherPersonProblem = {
    problem_claim: "yes",
    experience_actor: "other",
    friction_specificity: "concrete",
    content_kind: "organic",
    evidence_quote: "친구가 두 시간째 배달이 안 온다고 했다",
  };
  assert.equal(deriveSemanticGateDecision(otherPersonProblem), "reject");
  assert.deepEqual(normalizeSemanticJudgment(otherPersonProblem, otherPersonProblem.evidence_quote), otherPersonProblem);
});

test("PASS is deterministic and requires self + concrete + organic problem evidence", () => {
  assert.equal(deriveSemanticGateDecision({ problem_claim: "yes", experience_actor: "self", friction_specificity: "concrete", content_kind: "organic" }), "pass");
  assert.equal(deriveSemanticGateDecision({ problem_claim: "yes", experience_actor: "self", friction_specificity: "vague", content_kind: "organic" }), "reject");
  assert.equal(deriveSemanticGateDecision({ problem_claim: "uncertain", experience_actor: "unknown", friction_specificity: "unknown", content_kind: "unknown" }), "review");
});

test("secondary judge is selective and disagreements force REVIEW", () => {
  const clear = { problem_claim: "yes", experience_actor: "self", friction_specificity: "concrete", content_kind: "organic", evidence_quote: "예약이 계속 실패했다" };
  const disagree = { ...clear, experience_actor: "other" };
  assert.equal(needsSecondaryJudge({ judgment: clear, prefilterDecision: "continue" }), false);
  assert.equal(needsSecondaryJudge({ judgment: clear, prefilterDecision: "review" }), true);
  assert.equal(semanticJudgmentsAgree(clear, disagree), false);
  const resolved = resolveSemanticGate({ prefilter: { decision: "continue", reason_codes: [] }, primary: clear, secondary: disagree });
  assert.equal(resolved.final_decision, "review");
  assert.equal(resolved.system_certainty, "low");
});

test("human evaluation allows a real problem claim without falsely requiring first-hand", () => {
  const raw = "친구가 배달 주문했는데 두 시간째 안 온다고 했다.";
  const normalized = normalizeHumanEvaluationInput({
    problem_claim: "yes",
    experience_actor: "other",
    friction_specificity: "concrete",
    content_kind: "organic",
    evidence_quote: "두 시간째 안 온다고",
    annotator_note: "타인 경험",
  }, raw);
  assert.equal(normalized.problem_claim, "yes");
  assert.equal(normalized.experience_actor, "other");
});

test("blind evaluation contract is 120 = 60 representative + 60 challenge with fixed acquisition strata", () => {
  assert.equal(EVALUATION_TARGET, 120);
  assert.equal(REPRESENTATIVE_TARGET, 60);
  assert.equal(CHALLENGE_TARGET, 60);
  assert.deepEqual(CHALLENGE_BUCKET_TARGETS, { complaint_heavy: 15, domain_friction: 20, domain_neutral: 10, noise: 15 });
});

test("DB contract separates AI Silver from blind human authority and blocks AI leakage while labeling", async () => {
  const migration = await read("supabase/migrations/028_semantic_gate_blind_evaluation.sql");
  assert.match(migration, /ar_source_signal_semantic_judgments/);
  assert.match(migration, /ar_source_signal_silver_annotations/);
  assert.match(migration, /annotation_authority = 'ai_silver'/);
  assert.match(migration, /ar_source_signal_human_evaluations/);
  assert.match(migration, /annotation_authority = 'human_blind'/);
  assert.match(migration, /Blind evaluation Source Signal cannot receive AI labels before evaluation lock/);
  assert.match(migration, /Evaluation sample contract must be 60 representative \+ 60 challenge \(15\/20\/10\/15\)/);
  assert.match(migration, /revoke all on table public\.ar_source_signal_semantic_judgments from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert on table public\.ar_source_signal_semantic_judgments to service_role/);
  assert.doesNotMatch(migration, /ar_raw_inputs|ar_pain_evidences|ar_public_problems/);
});

test("semantic provider never asks the model to decide product gate status", async () => {
  const provider = await read("lib/sources/semantic-classifier.mjs");
  assert.match(provider, /Do not decide PASS, REVIEW, REJECT/);
  assert.match(provider, /problem_claim/);
  assert.match(provider, /experience_actor/);
  assert.match(provider, /friction_specificity/);
  assert.match(provider, /content_kind/);
  assert.doesNotMatch(provider, /confidence/);
  assert.doesNotMatch(provider, /decision: \{ type: "string"/);
});

test("Silver runner refuses live labeling before the blind sample is fixed and supports estimate-only", async () => {
  const runner = await read("scripts/run-silver-semantic-pipeline.mjs");
  assert.match(runner, /--estimate-only/);
  assert.match(runner, /assert\.equal\(evaluationIds\.size, 120/);
  assert.match(runner, /blind_evaluation_excluded/);
  assert.match(runner, /between \$\{pending\.length\} and \$\{pending\.length \* 2\}/);
});

test("blind labeling UI is one-card, keyboard-first, and contains no classifier/Silver read", async () => {
  const [page, card] = await Promise.all([
    read("app/curator/sources/evaluation/page.js"),
    read("app/components/blind-evaluation-card.js"),
  ]);
  assert.match(page, /getNextBlindEvaluation/);
  assert.match(page, /classifier, Silver, confidence를 조회하지 않습니다/);
  assert.match(card, /N · 문제 없음/);
  assert.match(card, /Y · 본인 구체 불편/);
  assert.match(card, /U · 애매/);
  assert.match(card, /Ctrl\/⌘\+Enter/);
  assert.match(card, /window\.getSelection/);
  assert.doesNotMatch(card, /\/classify/);
});

test("production deployment remains disabled", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  assert.equal(vercel.git.deploymentEnabled, false);
});
