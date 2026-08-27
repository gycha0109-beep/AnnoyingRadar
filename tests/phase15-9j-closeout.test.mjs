import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9J closeout retires the temporary live push trigger", async () => {
  const workflow = await read(".github/workflows/source-durable-candidate-formation-audit-15-9j.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /phase15-9j-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PHASE15_9J_FORMATION_AUDIT: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
});

test("15.9J closeout freezes exact live authority without widening to Incident formation", async () => {
  const doc = await read("docs/phase15-9j-durable-candidate-formation-audit.md");

  assert.match(doc, /\*\*CLOSED\*\*/);
  assert.match(doc, /PR #140/);
  assert.match(doc, /774121523ea3d1f5dc4b5aedf8a82b3d12bbd6aa/);
  assert.match(doc, /CI #479 = SUCCESS/);
  assert.match(doc, /PIE #123 = SUCCESS/);
  assert.match(doc, /6f509ca290ed8b705f4081948b38daf60e15f19f/);
  assert.match(doc, /merged-main CI #480 = SUCCESS/);

  assert.match(doc, /PR #141/);
  assert.match(doc, /80dd783db769ea169012d449e618d7e5c617a01b/);
  assert.match(doc, /CI #481 = SUCCESS/);
  assert.match(doc, /PIE #124 = SUCCESS/);
  assert.match(doc, /a3e244e1e8c9826aa936cbfd67391b8c497d7162/);
  assert.match(doc, /merged-main CI #482 = SUCCESS/);

  assert.match(doc, /33044887515/);
  assert.match(doc, /9635238500/);
  assert.match(doc, /first\.content_hash drifted from frozen authority/);
  assert.match(doc, /33045446281/);
  assert.match(doc, /9635465894/);

  assert.match(doc, /formation_evaluated = 2/);
  assert.match(doc, /context_drift = 1/);
  assert.match(doc, /eligible = 0/);
  assert.match(doc, /review = 2/);
  assert.match(doc, /source network requests = 6/);
  assert.match(doc, /model calls = 4/);
  assert.match(doc, /database writes = 0/);
  assert.match(doc, /ordinal 4/);
  assert.match(doc, /ordinal 9/);
  assert.match(doc, /ordinal 16/);
  assert.match(doc, /source_formation_provider_incomplete/);
  assert.match(doc, /formation_inconclusive_due_context_drift/);

  assert.match(doc, /full-context outcomes = 85/);
  assert.match(doc, /Phase 15\.9I batch rows = 3/);
  assert.match(doc, /Incident identity/);
  assert.match(doc, /Incident persistence/);
  assert.match(doc, /Public Evidence/);
  assert.match(doc, /publication/);
  assert.match(doc, /workflow is manual-only after closeout/);
});
