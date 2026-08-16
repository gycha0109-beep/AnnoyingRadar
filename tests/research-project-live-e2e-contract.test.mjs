import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const RUNNER = "scripts/run-research-projects-live-e2e.mjs";

test("Research Project live runner keeps authentication manual and secrets out of artifacts", async () => {
  const source = await read(RUNNER);
  assert.match(source, /브라우저에서 로그인하십시오/);
  assert.match(source, /chromium\.launch\(\{ headless: false \}\)/);
  assert.doesNotMatch(source, /storageState\s*:/);
  assert.doesNotMatch(source, /password\s*:/i);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY.*writeFile|SUPABASE_SERVICE_ROLE_KEY.*writeFile/);
});

test("Research Project live runner discovers only safe Phase 7 E2E assets through authenticated APIs", async () => {
  const source = await read(RUNNER);
  assert.match(source, /context\.request\.get\(new URL\("\/api\/raw-inputs\/recent"/);
  assert.match(source, /analysis_status !== "completed"/);
  assert.match(source, /raw_text.*includes\("\[AR-E2E:"\)/s);
  assert.match(source, /\/api\/problem-candidates\/\$\{candidate\.id\}\/save/);
  assert.match(source, /saved_problem\?\.status !== "active"/);
  assert.match(source, /\/api\/problem-candidates\/\$\{candidate\.id\}\/ideas/);
  assert.match(source, /기존 사용자 자산을 수정하지 않기 위해 \[AR-E2E:\] source만 사용합니다/);
});

test("Research Project live runner verifies explicit Phase 9 lifecycle and leaves fixture archived", async () => {
  const source = await read(RUNNER);
  for (const step of [
    "find-safe-project-source",
    "create-research-project",
    "project-detail-reentry",
    "project-metadata-edit",
    "link-existing-idea",
    "unlink-relink-idea",
    "project-archive",
    "project-restore-persistence",
    "final-fixture-archive",
  ]) {
    assert.match(source, new RegExp(`step\\("${step}"`));
  }

  assert.match(source, /ResearchProjectsLiveE2E: PASS/);
  assert.match(source, /project_create_link_verified/);
  assert.match(source, /idea_unlink_relink_verified/);
  assert.match(source, /project_restore_persistence_verified/);
  assert.match(source, /final_fixture_archive_verified/);
});

test("package exposes explicit Phase 9 live gate and release syntax check", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(
    packageJson.scripts["e2e:projects:live"],
    "node scripts/run-research-projects-live-e2e.mjs",
  );
  assert.match(packageJson.scripts["test:release"], /run-research-projects-live-e2e\.mjs/);
  assert.match(packageJson.scripts["test:release"], /research-project-live-e2e-contract\.test\.mjs/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
