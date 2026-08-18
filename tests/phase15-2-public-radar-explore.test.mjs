import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("product home is anonymous-first Public Radar discovery", async () => {
  const source = await read("app/page.js");

  assert.match(source, /사람들이 요즘, 무엇을 불편해하고 있을까요\?/);
  assert.match(source, /listPublishedPublicProblems/);
  assert.match(source, /role="search"/);
  assert.match(source, /문제 검색/);
  assert.match(source, /최근 발견된 문제/);
  assert.match(source, /공개 근거/);
  assert.match(source, /\/radar\/problems\/\$\{problem\.id\}/);
  assert.doesNotMatch(source, /RawInputDashboard/);
  assert.doesNotMatch(source, /requireUser|createServiceClient/);
});

test("personal Raw Input workflow remains available behind authenticated workspace", async () => {
  const source = await read("app/workspace/page.js");

  assert.match(source, /RawInputDashboard/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /if \(!user\) redirect\("\/login"\)/);
  assert.match(source, /Personal Research Workspace/);
  assert.match(source, /href="\/"[^>]*>Public Radar/);
});

test("public Problem detail leads with evidence and source provenance", async () => {
  const source = await read("app/radar/problems/[publicProblemId]/page.js");

  assert.match(source, /loadPublishedPublicProblemDetail/);
  assert.match(source, /사람들은 실제로 이렇게 말했습니다/);
  assert.match(source, /건의 공개 근거에서 확인/);
  assert.match(source, /원문 보기/);
  assert.match(source, /source_url/);
  assert.doesNotMatch(source, /source_key/);
  assert.doesNotMatch(source, /createServiceClient|requireUser/);
});

test("production login enters workspace while live E2E compatibility stays explicitly isolated", async () => {
  const [actions, home, bootstrap] = await Promise.all([
    read("app/login/actions.js"),
    read("app/page.js"),
    read("scripts/run-live-browser-e2e-bootstrap.mjs"),
  ]);

  assert.match(actions, /AR_LIVE_E2E_WORKSPACE_HOME === "1" \? "\/" : "\/workspace"/);
  assert.match(actions, /signOut/);
  assert.match(home, /AR_LIVE_E2E_WORKSPACE_HOME === "1" && user/);
  assert.match(bootstrap, /process\.env\.AR_LIVE_E2E_WORKSPACE_HOME = "1"/);
  assert.doesNotMatch(bootstrap, /PROJECT_PREFERRED_ENV_KEYS[\s\S]*AR_LIVE_E2E_WORKSPACE_HOME/);
});

test("Radar presentation keeps internal workflow concepts out of the public home", async () => {
  const source = await read("app/page.js");

  for (const internalTerm of [
    "Pain Evidence",
    "Problem Candidate",
    "Research Project",
    "Idea Candidate",
    "Raw Input 저장",
  ]) {
    assert.equal(source.includes(internalTerm), false, internalTerm);
  }

  assert.match(source, /인터넷 전체의 여론을 대표하지 않습니다/);
  assert.match(source, /검증된 Problem만 공개합니다/);
});
