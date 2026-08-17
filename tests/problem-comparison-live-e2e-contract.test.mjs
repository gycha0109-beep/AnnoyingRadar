import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const bootstrapSource = await readFile(
  new URL("../scripts/run-problem-comparison-live-e2e-bootstrap.mjs", import.meta.url),
  "utf8",
);
const runnerSource = await readFile(
  new URL("../scripts/run-problem-comparison-live-e2e.mjs", import.meta.url),
  "utf8",
);

test("Problem comparison live command enters through the hardened bootstrap", () => {
  assert.equal(
    packageJson.scripts["e2e:problem-comparison:live"],
    "node scripts/run-problem-comparison-live-e2e-bootstrap.mjs",
  );
  assert.match(packageJson.scripts["test:release"], /run-problem-comparison-live-e2e-bootstrap\.mjs/);
  assert.match(packageJson.scripts["test:release"], /run-problem-comparison-live-e2e\.mjs/);
});

test("Problem comparison bootstrap preserves project root and server environment", () => {
  assert.match(bootstrapSource, /const PROJECT_ROOT/);
  assert.match(bootstrapSource, /cwd: PROJECT_ROOT/);
  assert.match(bootstrapSource, /env: process\.env/);
  assert.match(bootstrapSource, /npm_execpath/);
  assert.match(bootstrapSource, /process\.platform === "win32"/);
  assert.match(bootstrapSource, /\.env\.local/);
  assert.match(bootstrapSource, /run-problem-comparison-live-e2e\.mjs/);
});

test("Problem comparison live flow is read-only and fails on browser or hydration errors", () => {
  assert.match(runnerSource, /open-comparison-catalog/);
  assert.match(runnerSource, /select-two-problem-cards/);
  assert.match(runnerSource, /verify-comparison-table/);
  assert.match(runnerSource, /reload-persistence/);
  assert.match(runnerSource, /return-to-catalog/);
  assert.match(runnerSource, /pageErrors\.length/);
  assert.match(runnerSource, /Hydration failed\|hydration mismatch/);
  assert.match(runnerSource, /ProblemComparisonLiveE2EStrict: PASS/);
  assert.doesNotMatch(runnerSource, /\.post\(|\.patch\(|\.delete\(/i);
});
