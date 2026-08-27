import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9E closeout retires the one-shot live branch trigger", async () => {
  const workflow = await read(".github/workflows/source-origin-contract-verification-15-9e.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /agent\/phase15-9e-live-execution/);
  assert.match(workflow, /retention-days: 1/);
});
