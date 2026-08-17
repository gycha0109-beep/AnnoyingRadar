import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("v0.3 live command enters the hardened bootstrap", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(
    pkg.scripts["e2e:v0.3:live"],
    "node scripts/run-v03-live-e2e-bootstrap.mjs",
  );
});

test("v0.3 bootstrap preserves project-root, env and Windows spawn hardening", async () => {
  const source = await read("scripts/run-v03-live-e2e-bootstrap.mjs");
  assert.match(source, /PROJECT_ROOT/);
  assert.match(source, /cwd:\s*PROJECT_ROOT/);
  assert.match(source, /env:\s*process\.env/);
  assert.match(source, /npm_execpath/);
  assert.match(source, /process\.platform === "win32"/);
  assert.match(source, /\.env\.local/);
  assert.match(source, /run-v03-live-e2e\.mjs/);
});

test("v0.3 live E2E covers the consolidated research workspace read-only", async () => {
  const source = await read("scripts/run-v03-live-e2e.mjs");
  for (const required of [
    "/problems",
    "category=",
    "/problems/compare",
    "/ideas",
    "/projects",
    "/api/exports/problem-candidates",
    "/api/exports/idea-candidates",
    "/api/exports/projects",
    "V03ProductLiveE2E: PASS",
    "V03ProductLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)",
  ]) {
    assert.ok(source.includes(required), `v0.3 live E2E missing ${required}`);
  }

  assert.doesNotMatch(source, /context\.request\.(post|patch|delete)\(/i);
  assert.doesNotMatch(source, /page\.request\.(post|patch|delete)\(/i);
});

test("v0.3 live E2E fails on page or hydration diagnostics", async () => {
  const source = await read("scripts/run-v03-live-e2e.mjs");
  assert.match(source, /targetPage\.on\("pageerror"/);
  assert.match(source, /Hydration failed\|hydration mismatch/i);
  assert.match(source, /if \(pageErrors\.length\) throw new Error/);
  assert.match(source, /if \(hydration\.length\) throw new Error/);
  assert.match(source, /page-errors\.log/);
  assert.match(source, /browser-console\.log/);
});
