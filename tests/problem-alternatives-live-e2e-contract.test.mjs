import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("Problem alternatives live command enters the hardened bootstrap", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(
    pkg.scripts["e2e:problem-alternatives:live"],
    "node scripts/run-problem-alternatives-live-e2e-bootstrap.mjs",
  );
});

test("Problem alternatives bootstrap preserves project-root, env and Windows spawn hardening", async () => {
  const source = await read("scripts/run-problem-alternatives-live-e2e-bootstrap.mjs");
  assert.match(source, /PROJECT_ROOT/);
  assert.match(source, /cwd:\s*PROJECT_ROOT/);
  assert.match(source, /env:\s*process\.env/);
  assert.match(source, /npm_execpath/);
  assert.match(source, /process\.platform === "win32"/);
  assert.match(source, /\.env\.local/);
  assert.match(source, /run-problem-alternatives-live-e2e\.mjs/);
});

test("Problem alternatives live E2E performs canonical create-edit-delete and verifies cleanup", async () => {
  const source = await read("scripts/run-problem-alternatives-live-e2e.mjs");
  assert.match(source, /\/problems\/compare/);
  assert.match(source, /\/problem-candidates\/\$\{candidateId\}\/alternatives/);
  assert.match(source, /create-service-note/);
  assert.match(source, /edit-to-alternative/);
  assert.match(source, /delete-note/);
  assert.match(source, /cleanupTestNotes/);
  assert.match(source, /context\.request\.delete/);
  assert.match(source, /assert\.equal\(notes\.length, initialCount\)/);
  assert.match(source, /ProblemAlternativesLiveE2E: PASS/);
  assert.match(source, /ProblemAlternativesLiveE2EStrict: PASS \(browser page errors: 0, hydration errors: 0\)/);
});

test("Problem alternatives live gate fails on page or hydration diagnostics", async () => {
  const source = await read("scripts/run-problem-alternatives-live-e2e.mjs");
  assert.match(source, /targetPage\.on\("pageerror"/);
  assert.match(source, /Hydration failed\|hydration mismatch/i);
  assert.match(source, /if \(pageErrors\.length\) throw new Error/);
  assert.match(source, /if \(hydration\.length\) throw new Error/);
  assert.match(source, /page-errors\.log/);
  assert.match(source, /browser-console\.log/);
});
