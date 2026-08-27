import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9H closeout retires the one-shot push trigger", async () => {
  const workflow = await read(".github/workflows/source-provider-incomplete-recovery-15-9h.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /phase15-9h-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /retention-days: 1/);
});

test("15.9H closeout freezes confirmed false negatives without granting recovery authority", async () => {
  const doc = await read("docs/phase15-9h-provider-incomplete-recovery.md");

  assert.match(doc, /\*\*CLOSED\*\*/);
  assert.match(doc, /PR #136/);
  assert.match(doc, /f6412dce56590e40f1bf49faaca203b493a4f636/);
  assert.match(doc, /CI #470 = SUCCESS/);
  assert.match(doc, /PIE #118 = SUCCESS/);
  assert.match(doc, /9e997ba6d46b07207be4c517cf7b23ecb951602c/);
  assert.match(doc, /merged-main CI #471 = SUCCESS/);
  assert.match(doc, /Actions run id = 33041740366/);
  assert.match(doc, /artifact id = 9634167089/);

  assert.match(doc, /fetch_pair_stable = 8/);
  assert.match(doc, /fresh_first_attempt_resolved = 3/);
  assert.match(doc, /provider_recovery_attempted = 5/);
  assert.match(doc, /provider_recovered_after_retry = 4/);
  assert.match(doc, /provider_recovery_exhausted = 1/);
  assert.match(doc, /quote_recovery_attempted = 0/);
  assert.match(doc, /candidate = 3/);
  assert.match(doc, /reject = 4/);
  assert.match(doc, /unavailable = 1/);
  assert.match(doc, /false_negative_confirmed = 3/);
  assert.match(doc, /diagnostic_conclusion = source_admission_false_negative_detected/);
  assert.match(doc, /ordinal 4/);
  assert.match(doc, /ordinal 9/);
  assert.match(doc, /ordinal 16/);
  assert.match(doc, /database writes = 0/);
  assert.match(doc, /Source Admission recovery = 0/);
  assert.match(doc, /Candidate findings remain diagnostic evidence only/);
  assert.match(doc, /PHASE 15\.9H = CLOSED/);
});
