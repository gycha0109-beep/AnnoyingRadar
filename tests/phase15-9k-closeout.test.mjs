import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9K closeout retires the temporary live push trigger", async () => {
  const workflow = await read(".github/workflows/source-formation-provider-recovery-15-9k.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /phase15-9k-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9K_FORMATION_PROVIDER_RECOVERY: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
});

test("15.9K closeout freezes provider recovery findings without widening Formation authority", async () => {
  const doc = await read("docs/phase15-9k-formation-provider-recovery.md");

  assert.match(doc, /\*\*CLOSED\*\*/);
  assert.match(doc, /PR #143/);
  assert.match(doc, /22838cf5d98e2df3f23ac62bdf76488cdffa445c/);
  assert.match(doc, /CI #485 = SUCCESS/);
  assert.match(doc, /PIE #126 = SUCCESS/);
  assert.match(doc, /75ebfc331cbc5712c7a7bc788c6e98ef614385e1/);
  assert.match(doc, /merged-main CI #486 = SUCCESS/);

  assert.match(doc, /33046626749/);
  assert.match(doc, /9635910441/);
  assert.match(doc, /49b6c19fb3b29274f23ce55890ffc05ff2df40949a8ece570c5b7b411291274b/);

  assert.match(doc, /context integrity passed = 2/);
  assert.match(doc, /source network requests = 4/);
  assert.match(doc, /model calls = 3/);
  assert.match(doc, /database writes = 0/);
  assert.match(doc, /provider_recovery_attempted = 1/);
  assert.match(doc, /provider_recovered_after_budgeted_retry = 1/);
  assert.match(doc, /eligible = 0/);
  assert.match(doc, /review = 1/);
  assert.match(doc, /reject = 1/);
  assert.match(doc, /max_output_tokens = 1 occurrence/);

  assert.match(doc, /ordinal 9/);
  assert.match(doc, /incomplete_details\.reason = max_output_tokens/);
  assert.match(doc, /requested max_output_tokens = 2400/);
  assert.match(doc, /formation_state = reject/);
  assert.match(doc, /formation_incidental_friction/);

  assert.match(doc, /ordinal 16/);
  assert.match(doc, /provider status = completed/);
  assert.match(doc, /formation_state = review/);
  assert.match(doc, /formation_semantic_uncertain/);

  assert.match(doc, /full_context_outcomes = 85/);
  assert.match(doc, /Phase 15\.9I batch rows = 3/);
  assert.match(doc, /Formation eligibility for any target/);
  assert.match(doc, /Incident identity/);
  assert.match(doc, /production activation of the 2400-token recovery policy/);
  assert.match(doc, /workflow is manual-only after closeout/);
});
