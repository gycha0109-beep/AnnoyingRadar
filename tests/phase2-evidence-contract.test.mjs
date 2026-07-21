import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = [
  "app/api/raw-inputs/[rawInputId]/evidence/route.js",
  "app/api/raw-inputs/[rawInputId]/evidence/fixture/route.js",
  "app/api/raw-inputs/[rawInputId]/evidence/confirm/route.js",
];

test("Phase 2 Evidence routes retain owner checks and atomic functions", async () => {
  const sources = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  for (const source of sources) {
    assert.match(source, /requireUser/);
    assert.match(source, /assertRawInputOwner/);
  }
  assert.match(sources.join("\n"), /ar_update_evidence_batch/);
  assert.match(sources.join("\n"), /ar_replace_evidence_fixture/);
  assert.match(sources.join("\n"), /ar_confirm_evidence_review/);
});

test("Phase 2 Evidence UI retains fixture, edit, delete and confirm actions", async () => {
  const source = await readFile("app/raw-inputs/[rawInputId]/evidence-review.js", "utf8");
  assert.match(source, /고정 fixture/);
  assert.match(source, /수정 내용 저장/);
  assert.match(source, /deleted 처리/);
  assert.match(source, /grouping 진입/);
});