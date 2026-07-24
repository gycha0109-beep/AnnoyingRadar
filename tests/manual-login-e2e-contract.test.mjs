import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const script = await readFile("scripts/run-live-browser-e2e.mjs", "utf8");
const design = await readFile("docs/phase6-1-manual-login-browser-e2e.md", "utf8");
const gitignore = await readFile(".gitignore", "utf8");

test("package exposes a pinned one-command live browser runner", () => {
  assert.equal(packageJson.scripts["e2e:live"], "node scripts/run-live-browser-e2e.mjs");
  assert.equal(packageJson.devDependencies.playwright, "1.61.1");
  assert.match(packageJson.scripts["test:release"], /node --check scripts\/run-live-browser-e2e\.mjs/);
  assert.match(packageJson.scripts["test:release"], /manual-login-e2e-contract\.test\.mjs/);
});

test("authentication remains manual and no reusable session secret is persisted", () => {
  assert.match(script, /headless:\s*false/);
  assert.match(script, /브라우저에서 로그인하십시오/);
  assert.match(script, /getByRole\("button", \{ name: "로그아웃" \}\)/);
  assert.doesNotMatch(script, /storageState\s*:/);
  assert.doesNotMatch(script, /E2E_USER_EMAIL|E2E_USER_PASSWORD/);
  assert.doesNotMatch(script, /name:\s*["']email["']|name:\s*["']password["']/);
});

test("runner covers the complete live workflow after login", () => {
  for (const required of [
    "Raw Input 저장",
    "AI Evidence 추출",
    "Evidence 수정 내용을 저장했습니다.",
    "남은 Evidence 확정 및 grouping 진입",
    "Problem Candidate 생성",
    "Candidate 수정 내용을 저장했습니다.",
    "Candidate 폐기",
    "Candidate 복구",
    "새 Candidate로 분리",
    "선택 Candidate에 병합",
    "문제 카드로 확정",
    "Candidate 검토 완료",
    "최근 입력 3개",
    "완료된 분석은 읽기 전용입니다.",
  ]) {
    assert.match(script, new RegExp(required), required);
  }
});

test("runner adapts structural coverage to nondeterministic AI grouping", () => {
  assert.match(script, /split_then_merge/);
  assert.match(script, /merge_then_split_then_merge/);
  assert.match(script, /evidenceCount > 1/);
  assert.match(script, /initialCandidates\.length >= 2/);
});

test("runner owns local server lifecycle and auto-installs Chromium when missing", () => {
  assert.match(script, /ensureApplicationServer/);
  assert.match(script, /npm\.cmd/);
  assert.match(script, /playwright", "install", "chromium/);
  assert.match(script, /taskkill/);
  assert.match(script, /serverProcess\.kill\("SIGTERM"\)/);
});

test("diagnostics are retained without committing artifacts", () => {
  assert.match(script, /context\.tracing\.start/);
  assert.match(script, /trace\.zip/);
  assert.match(script, /page\.screenshot/);
  assert.match(script, /browser-console\.json/);
  assert.match(script, /page-errors\.json/);
  assert.match(script, /request-failures\.json/);
  assert.match(gitignore, /^artifacts\/$/m);
});

test("design records the one-human-action boundary and audit policy", () => {
  assert.match(design, /one human action/i);
  assert.match(design, /never reads an email or password/i);
  assert.match(design, /never writes Playwright storage state or Supabase tokens/i);
  assert.match(design, /unique `AR-E2E` marker/i);
  assert.match(design, /recent-three re-entry/i);
});
