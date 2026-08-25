import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8H pilot reconstructs the exact frozen holdout before selecting terminal quote ordinals", async () => {
  const runner = await read("scripts/run-source-full-context-quote-isolation-pilot.mjs");
  assert.match(runner, /FROZEN_EXACT_RUN_CUTOFF = "2026-08-25T02:29:36\.982Z"/);
  assert.match(runner, /EXPECTED_EXACT_RUNS = 24/);
  assert.match(runner, /EXPECTED_EXACT_NEW = 961/);
  assert.match(runner, /EXPECTED_REVIEWS = 166/);
  assert.match(runner, /EXPECTED_HOLDOUT_FINGERPRINT = "30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7"/);
  assert.match(runner, /PHASE15_8G_TERMINAL_QUOTE_ORDINALS = Object\.freeze\(\[10, 17\]\)/);
  assert.match(runner, /holdout fingerprint drifted/i);
});

test("15.8H pilot emits identity-free aggregate authority and explicit Formation non-authority", async () => {
  const runner = await read("scripts/run-source-full-context-quote-isolation-pilot.mjs");
  assert.match(runner, /individual_source_identities_emitted: false/);
  assert.match(runner, /quote_isolation_attempted/);
  assert.match(runner, /quote_isolation_recovered/);
  assert.match(runner, /resolved_with_null_admission_quote/);
  assert.match(runner, /formation_quote_authority_granted/);
  assert.match(runner, /formation_authority_mutations: 0/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /active_resolver_mutations: 0/);
  assert.doesNotMatch(runner, /source_signal_id:/);
  assert.doesNotMatch(runner, /canonical_url:/);
  assert.doesNotMatch(runner, /provider_request_id:/);
});

test("15.8H closeout returns the paid pilot workflow to manual-only", async () => {
  const workflow = await read(".github/workflows/source-quote-isolation-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /ops\/source-quote-isolation-pilot/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-source-full-context-quote-isolation-pilot\.mjs --live/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("15.8H does not modify the active resolver or Formation implementation", async () => {
  const [base, formation, isolation] = await Promise.all([
    read("lib/sources/source-full-context-resolution.mjs"),
    read("lib/sources/source-problem-formation.mjs"),
    read("lib/sources/source-full-context-quote-isolation.mjs"),
  ]);
  assert.match(base, /SOURCE_FULL_CONTEXT_RESOLUTION_VERSION = "source-full-context-resolution-v0\.1"/);
  assert.doesNotMatch(base, /source-full-context-quote-isolation/);
  assert.match(formation, /evidence_quote/);
  assert.doesNotMatch(formation, /source-full-context-quote-isolation/);
  assert.match(isolation, /formation_quote_authority: "not_granted"/);
});
