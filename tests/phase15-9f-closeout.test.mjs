import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9F closeout leaves live pilot workflow manual-only", async () => {
  const workflow = await read(".github/workflows/source-external-web-full-context-pilot-15-9f.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /agent\/phase15-9f-live-execution/);
});

test("15.9F closeout documentation freezes live acquisition and DB invariance authority", async () => {
  const docs = await read("docs/phase15-9f-external-web-full-context.md");
  assert.match(docs, /LIVE VERIFIED \/ CLOSEOUT READY/);
  assert.match(docs, /run = 33038468135/);
  assert.match(docs, /artifact id = 9632937597/);
  assert.match(docs, /resolved = 16/);
  assert.match(docs, /unavailable = 0/);
  assert.match(docs, /database writes = 0/);
  assert.match(docs, /model calls = 0/);
  assert.match(docs, /semantic Source Admission judgement/);
  assert.match(docs, /does \*\*not\*\* establish that any of the sixteen are semantic false negatives/);
});
