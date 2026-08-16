import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("Idea Board live command uses strict diagnostics around the hardened bootstrap", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const strictRunner = await read("scripts/run-idea-board-live-e2e-strict.mjs");
  const bootstrap = await read("scripts/run-idea-board-live-e2e-bootstrap.mjs");

  assert.equal(
    packageJson.scripts["e2e:idea-board:live"],
    "node scripts/run-idea-board-live-e2e-strict.mjs",
  );
  assert.match(strictRunner, /run-idea-board-live-e2e-bootstrap\.mjs/);
  assert.match(strictRunner, /page-errors\.log/);
  assert.match(strictRunner, /browser-console\.log/);
  assert.match(strictRunner, /Hydration failed|hydration mismatch/);
  assert.match(strictRunner, /IdeaBoardLiveE2EStrict: PASS/);

  assert.match(bootstrap, /PROJECT_ROOT/);
  assert.match(bootstrap, /cwd:\s*PROJECT_ROOT/);
  assert.match(bootstrap, /env:\s*process\.env/);
  assert.match(bootstrap, /npm_execpath/);
  assert.match(bootstrap, /shell:\s*process\.platform === "win32"/);
  assert.match(bootstrap, /PROJECT_PREFERRED_ENV_KEYS/);
  assert.match(bootstrap, /\.env\.local/);
});

test("Idea Board live runner discovers only safe AR-E2E source assets", async () => {
  const runner = await read("scripts/run-idea-board-live-e2e.mjs");

  assert.match(runner, /\/api\/raw-inputs\/recent/);
  assert.match(runner, /\[AR-E2E:/);
  assert.match(runner, /analysis_status !== "completed"/);
  assert.match(runner, /status === "confirmed"/);
  assert.match(runner, /\/api\/idea-candidates\/\$\{idea\.id\}\/projects/);
  assert.doesNotMatch(runner, /storageState\s*:/);
  assert.doesNotMatch(runner, /password|credential/i);
});

test("Idea Board live runner verifies drag, persistence, actual project filter control and fallback restore", async () => {
  const runner = await read("scripts/run-idea-board-live-e2e.mjs");

  assert.match(runner, /dragTo\(targetLane\)/);
  assert.match(runner, /reload-persistence/);
  assert.match(runner, /상태 변경 이력/);
  assert.match(runner, /selectOption\(source\.projectId\)/);
  assert.match(runner, /searchParams\.get\("project"\) === source\.projectId/);
  assert.match(runner, /selectOption\(source\.initialStatus\)/);
  assert.match(runner, /final_state_restored = true/);
  assert.match(runner, /IdeaBoardLiveE2E: PASS/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
