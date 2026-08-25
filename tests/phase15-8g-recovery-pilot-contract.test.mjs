import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8G pilot reconstructs the exact 15.8F holdout before selecting eight unresolved ordinals", async () => {
  const runner = await read("scripts/run-source-full-context-recovery-pilot.mjs");
  assert.match(runner, /FROZEN_EXACT_RUN_CUTOFF = "2026-08-25T02:29:36\.982Z"/);
  assert.match(runner, /EXPECTED_EXACT_RUNS = 24/);
  assert.match(runner, /EXPECTED_EXACT_NEW = 961/);
  assert.match(runner, /EXPECTED_REVIEWS = 166/);
  assert.match(runner, /EXPECTED_HOLDOUT_FINGERPRINT = "30bb0ea9980f1ef1055f6e9d0a97df78271048c573ac66ef95877f02dcbc49d7"/);
  assert.match(runner, /\[7, 10, 12, 13, 17, 24, 28, 44\]/);
  assert.match(runner, /holdout fingerprint drifted/i);
});

test("15.8G pilot emits aggregate recovery diagnostics without source identity payloads", async () => {
  const runner = await read("scripts/run-source-full-context-recovery-pilot.mjs");
  assert.match(runner, /individual_source_identities_emitted: false/);
  assert.match(runner, /unresolved_reduction/);
  assert.match(runner, /recovery_attempted/);
  assert.match(runner, /recovered_after_retry/);
  assert.match(runner, /recovery_exhausted/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /blind_evaluation_reads: 0/);
  assert.match(runner, /active_resolver_mutations: 0/);
  assert.doesNotMatch(runner, /source_signal_id:/);
  assert.doesNotMatch(runner, /canonical_url:/);
  assert.doesNotMatch(runner, /provider_request_id:/);
});

test("15.8G pilot workflow is manual-only after closeout and still checks out authoritative main", async () => {
  const workflow = await read(".github/workflows/source-semantic-recovery-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.doesNotMatch(workflow, /ops\/source-semantic-recovery-pilot/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-source-full-context-recovery-pilot\.mjs --live/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("15.8G remains a separate lane and does not change the active base resolver", async () => {
  const [base, recovery] = await Promise.all([
    read("lib/sources/source-full-context-resolution.mjs"),
    read("lib/sources/source-full-context-recovery.mjs"),
  ]);
  assert.match(base, /SOURCE_FULL_CONTEXT_RESOLUTION_VERSION = "source-full-context-resolution-v0\.1"/);
  assert.doesNotMatch(base, /source-full-context-recovery/);
  assert.match(recovery, /SOURCE_FULL_CONTEXT_RECOVERY_VERSION = "source-full-context-recovery-v0\.1"/);
});
