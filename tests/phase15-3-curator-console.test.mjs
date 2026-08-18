import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Vercel Git auto deployments stay fully paused", async () => {
  const config = JSON.parse(await read("vercel.json"));
  assert.equal(config.git?.deploymentEnabled, false);
});

test("curator queue requires login plus explicit curator membership", async () => {
  const source = await read("app/curator/page.js");

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /if \(!user\) redirect\("\/login"\)/);
  assert.match(source, /from\("ar_radar_curators"\)/);
  assert.match(source, /if \(!curator\?\.role\) redirect\("\/workspace"\)/);
  assert.match(source, /listAdminPublicProblems/);
  assert.match(source, /CuratorCreateProblemForm/);
});

test("curator create form creates only a server-authorized Public Problem draft", async () => {
  const source = await read("app/components/curator-create-problem-form.js");

  assert.match(source, /fetch\("\/api\/radar\/admin\/problems"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /router\.push\(`\/curator\/problems\/\$\{id\}`\)/);
  assert.doesNotMatch(source, /createServiceClient|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("curator editor covers the complete publication workflow", async () => {
  const source = await read("app/components/curator-problem-editor.js");

  for (const required of [
    "/api/radar/admin/problems/${problem.id}",
    "/api/radar/admin/problems/${problem.id}/evidence",
    "/api/radar/admin/problems/${problem.id}/source-problems",
    "/api/radar/admin/problems/${problem.id}/status",
    "external_public",
    "user_opt_in",
    "Publish",
    "Archive",
    "Published 상태는 편집 잠금입니다.",
  ]) {
    assert.equal(source.includes(required), true, required);
  }

  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /method: "DELETE"/);
  assert.doesNotMatch(source, /createServiceClient|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("client-side publication readiness mirrors the database publication gate", async () => {
  const source = await read("app/components/curator-problem-editor.js");

  assert.match(source, /evidence\.length >= 2/);
  assert.match(source, /distinctSources >= 2/);
  assert.match(source, /\["external_public", "user_opt_in"\]\.includes/);
  assert.match(source, /Boolean\(problem\.title\?\.trim\(\)\)/);
  assert.match(source, /Boolean\(problem\.summary\?\.trim\(\)\)/);
  assert.match(source, /disabled=\{!publishReady \|\| Boolean\(busy\)\}/);
});

test("published Problems are treated as immutable until archive", async () => {
  const source = await read("app/components/curator-problem-editor.js");

  assert.match(source, /const locked = problem\.status === "published"/);
  assert.match(source, /disabled=\{locked\}/);
  assert.match(source, /먼저 Archive한 뒤 수정하고 다시 Publish/);
});

test("workspace only surfaces curator entry for curator users", async () => {
  const [route, workspace] = await Promise.all([
    read("app/workspace/page.js"),
    read("app/components/personal-workspace.js"),
  ]);

  assert.match(route, /from\("ar_radar_curators"\)/);
  assert.match(route, /curatorRole=\{curator\?\.role \?\? null\}/);
  assert.match(workspace, /curatorRole \? <Link[^>]*href="\/curator"/);
});
