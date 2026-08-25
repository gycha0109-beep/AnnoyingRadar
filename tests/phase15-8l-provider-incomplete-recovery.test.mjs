import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SourceFullContextResolutionError } from "../lib/sources/source-full-context-resolution.mjs";
import {
  isSourceFullContextRecoveryEligible,
  runSourceFullContextJudgeWithRecovery,
} from "../lib/sources/source-full-context-recovery.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const PROVIDER_ONLY = ["source_full_context_provider_incomplete"];

test("15.8L provider-only scope retries provider incomplete but never invalid quote", async () => {
  const providerError = new SourceFullContextResolutionError(
    "source_full_context_provider_incomplete",
    "incomplete",
  );
  const quoteError = new SourceFullContextResolutionError(
    "source_full_context_invalid_evidence_quote",
    "quote mismatch",
  );

  assert.equal(isSourceFullContextRecoveryEligible(providerError, { eligibleReasonCodes: PROVIDER_ONLY }), true);
  assert.equal(isSourceFullContextRecoveryEligible(quoteError, { eligibleReasonCodes: PROVIDER_ONLY }), false);

  let quoteCalls = 0;
  const quote = await runSourceFullContextJudgeWithRecovery(async () => {
    quoteCalls += 1;
    throw quoteError;
  }, { fullText: "x" }, { eligibleReasonCodes: PROVIDER_ONLY });
  assert.equal(quoteCalls, 1);
  assert.equal(quote.recovery.attempted, false);
  assert.equal(quote.recovery.terminal_reason_code, "source_full_context_invalid_evidence_quote");

  let providerCalls = 0;
  const provider = await runSourceFullContextJudgeWithRecovery(async (_input, control) => {
    providerCalls += 1;
    if (providerCalls === 1) throw providerError;
    assert.equal(control.recoveryReasonCode, "source_full_context_provider_incomplete");
    return {
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
      evidence_quote: null,
    };
  }, { fullText: "x" }, { eligibleReasonCodes: PROVIDER_ONLY });
  assert.equal(providerCalls, 2);
  assert.equal(provider.recovery.attempted, true);
  assert.equal(provider.recovery.recovered, true);
});

test("15.8G default recovery contract remains unchanged when no scope is passed", async () => {
  let calls = 0;
  const judged = await runSourceFullContextJudgeWithRecovery(async () => {
    calls += 1;
    if (calls === 1) {
      throw new SourceFullContextResolutionError(
        "source_full_context_invalid_evidence_quote",
        "quote mismatch",
      );
    }
    return {
      problem_claim: "no",
      experience_actor: "unknown",
      friction_cause: "unknown",
      friction_specificity: "vague",
      pain_centrality: "incidental",
      content_kind: "informational",
      evidence_quote: null,
    };
  }, { fullText: "x" });
  assert.equal(calls, 2);
  assert.equal(judged.recovery.attempted, true);
  assert.equal(judged.recovery.trigger_reason_code, "source_full_context_invalid_evidence_quote");
});

test("15.8L runner reconstructs exact K sample and targets identity-free unresolved ordinals", async () => {
  const runner = await read("scripts/run-provider-incomplete-recovery-reproduction.mjs");
  assert.match(runner, /EXPECTED_RUN_FINGERPRINT = "df80cfd2b8cec8899e8d87af6943ed2fa190db3d90ba192afc1c8332d9e028df"/);
  assert.match(runner, /EXPECTED_SAMPLE_FINGERPRINT = "9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6"/);
  assert.match(runner, /BASELINE_UNRESOLVED_ORDINALS = Object\.freeze\(\[5, 8, 10, 15, 17, 19, 20, 26, 28, 29, 41, 44, 45\]\)/);
  assert.match(runner, /PROVIDER_ONLY_RECOVERY_CODES = Object\.freeze\(\["source_full_context_provider_incomplete"\]\)/);
  assert.match(runner, /quote_recovery_attempted: quoteRetryAttempted/);
  assert.match(runner, /assert\.equal\(quoteRetryAttempted, 0/);
  assert.match(runner, /assert\.deepEqual\(after, before/);
  assert.match(runner, /active_resolver_mutations: 0/);
  assert.match(runner, /provider_recovery_product_activation: false/);
});

test("15.8L workflow is one-shot main-authoritative with no acquisition credentials", async () => {
  const workflow = await read(".github/workflows/source-provider-recovery-15-8l.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ops\/source-provider-recovery-15-8l/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.doesNotMatch(workflow, /NAVER_CLIENT_ID/);
  assert.doesNotMatch(workflow, /NAVER_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
