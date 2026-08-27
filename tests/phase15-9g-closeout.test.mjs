import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9G closeout retires the one-shot push trigger", async () => {
  const workflow = await read(".github/workflows/source-external-semantic-rejection-diagnostics-15-9g.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /phase15-9g-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /retention-days: 1/);
});

test("15.9G closeout freezes the exact live authority without overstating unresolved Sources", async () => {
  const doc = await read("docs/phase15-9g-semantic-rejection-diagnostics.md");

  assert.match(doc, /\*\*CLOSED\*\*/);
  assert.match(doc, /PR #134/);
  assert.match(doc, /96f540f840466953658881c580d8ea3a1034fbb7/);
  assert.match(doc, /8c95f49846b3cf7625d45f24b2b0cd5286c5faf4/);
  assert.match(doc, /CI #465 = SUCCESS/);
  assert.match(doc, /PIE #115 = SUCCESS/);
  assert.match(doc, /merged-main CI #466 = SUCCESS/);
  assert.match(doc, /Actions run id = 33040344776/);
  assert.match(doc, /artifact id = 9633646012/);

  assert.match(doc, /fetch_pair_stable = 16/);
  assert.match(doc, /fetch_pair_unstable = 0/);
  assert.match(doc, /candidate = 0/);
  assert.match(doc, /review = 0/);
  assert.match(doc, /reject = 8/);
  assert.match(doc, /unavailable = 8/);
  assert.match(doc, /source_full_context_provider_incomplete = 6/);
  assert.match(doc, /source_full_context_invalid_evidence_quote = 2/);
  assert.match(doc, /diagnostic_inconclusive_for_some_sources/);
  assert.match(doc, /database writes = 0/);

  assert.match(doc, /does \*\*not\*\* establish that all sixteen Source Admission rejections are policy-consistent/);
  assert.match(doc, /provider\/output failure should be interpreted as rejection/);
  assert.match(doc, /PHASE 15\.9G = CLOSED/);
});
