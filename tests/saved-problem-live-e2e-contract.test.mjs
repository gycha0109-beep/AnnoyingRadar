import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("Saved Problem live runner keeps authentication manual and credentials out of artifacts", async () => {
  const source = await read("scripts/run-saved-problems-live-e2e.mjs");
  assert.match(source, /브라우저에서 로그인하십시오/);
  assert.match(source, /chromium\.launch\(\{ headless: false/);
  assert.doesNotMatch(source, /storageState\s*:/);
  assert.doesNotMatch(source, /password\s*:/i);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY.*writeFile|SUPABASE_SECRET_KEY.*writeFile/);
});

test("Saved Problem live runner verifies complete Phase 8 lifecycle", async () => {
  const source = await read("scripts/run-saved-problems-live-e2e.mjs");
  for (const step of [
    "find-completed-problem-card",
    "save-problem-card",
    "saved-problem-metadata-edit",
    "saved-problems-reentry",
    "saved-problem-archive",
    "saved-problem-restore-persistence",
  ]) {
    assert.match(source, new RegExp(`step\\(\\"${step}\\"`));
  }

  assert.match(source, /SavedProblemsLiveE2E: PASS/);
  assert.match(source, /test_source_raw_input_id/);
  assert.match(source, /test_source_verified/);
  assert.match(source, /saved_problem_memo_verified/);
  assert.match(source, /saved_problem_library_reentry_verified/);
  assert.match(source, /saved_problem_archive_verified/);
  assert.match(source, /saved_problem_restore_verified/);
});

test("Saved Problem live gate discovers a safe source through authenticated APIs instead of client-render timing", async () => {
  const source = await read("scripts/run-saved-problems-live-e2e.mjs");
  assert.match(source, /context\.request\.get\(new URL\(\"\/api\/raw-inputs\/recent\"/);
  assert.match(source, /analysis_status !== \"completed\"/);
  assert.match(source, /raw_text.*includes\(\"\[AR-E2E:\"\)/s);
  assert.match(source, /\/api\/raw-inputs\/\$\{rawInput\.id\}\/candidates\?include_discarded=1/);
  assert.match(source, /candidate\?\.status === \"confirmed\"/);
  assert.match(source, /\/api\/problem-candidates\/\$\{candidate\.id\}\/save/);
  assert.match(source, /savePayload\?\.eligibility\?\.eligible === true/);
  assert.match(source, /savePayload\?\.saved_problem === null/);
  assert.match(source, /기존 저장 카드는 사용하지 않습니다/);
  assert.doesNotMatch(source, /recentItems\.count\(\)/);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
  assert.doesNotMatch(source, /Idea Candidate 생성/);
});

test("package scripts expose the explicit Phase 8 human-operated release gate", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(
    packageJson.scripts["e2e:saved-problems:live"],
    "node scripts/run-saved-problems-live-e2e.mjs",
  );
  assert.match(packageJson.scripts["test:release"], /run-saved-problems-live-e2e\.mjs/);
  assert.match(packageJson.scripts["test:release"], /saved-problem-live-e2e-contract\.test\.mjs/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
