import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9I closeout retires the one-shot live push trigger", async () => {
  const workflow = await read(".github/workflows/source-confirmed-fn-outcome-persistence-15-9i.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /phase15-9i-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});

test("15.9I closeout freezes exact append-only persistence without widening authority", async () => {
  const doc = await read("docs/phase15-9i-confirmed-fn-outcome-persistence.md");

  assert.match(doc, /\*\*CLOSED\*\*/);
  assert.match(doc, /PR #138/);
  assert.match(doc, /7aa6d4d2c5d6342913a64ebd1b649da4e0e0bd3b/);
  assert.match(doc, /CI #474 = SUCCESS/);
  assert.match(doc, /PIE #120 = SUCCESS/);
  assert.match(doc, /26f1db7eb5a2eed95724d6a08ad916824b3df7e8/);
  assert.match(doc, /merged-main CI #475 = SUCCESS/);
  assert.match(doc, /Actions run id = 33042653519/);
  assert.match(doc, /artifact id = 9634450429/);

  assert.match(doc, /context_integrity_verified = true/);
  assert.match(doc, /source_network_requests = 6/);
  assert.match(doc, /model_calls = 0/);
  assert.match(doc, /database_write_statements = 1/);
  assert.match(doc, /outcome_rows_before = 82/);
  assert.match(doc, /outcome_rows_inserted = 3/);
  assert.match(doc, /outcome_rows_after = 85/);
  assert.match(doc, /Phase 15\.9I batch rows = 3/);
  assert.match(doc, /decision = candidate for 3\/3/);
  assert.match(doc, /full_context_first_hand_external_friction/);

  assert.match(doc, /Source Admission policy mutation = 0/);
  assert.match(doc, /Incident mutations = 0/);
  assert.match(doc, /publication mutations = 0/);
  assert.match(doc, /It is not yet an Incident/);
  assert.match(doc, /PHASE 15\.9I = CLOSED/);
});
