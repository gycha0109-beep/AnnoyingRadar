import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

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
    "Incident Lineage",
  ]) {
    assert.equal(source.includes(required), true, required);
  }

  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /method: "DELETE"/);
  assert.doesNotMatch(source, /createServiceClient|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("client publication UI consumes server-side incident-aware readiness", async () => {
  const source = await read("app/components/curator-problem-editor.js");

  assert.match(source, /publication_readiness: publicationReadiness/);
  assert.match(source, /publicationReadiness\?\.structurally_publishable/);
  assert.match(source, /distinct_incident_count/);
  assert.match(source, /incident_lineage_valid/);
  assert.match(source, /source_key 수는 Incident 수를 대체하지 않습니다/);
  assert.match(source, /구조적 Gate 통과는 편집 승인이나 자동 게시를 의미하지 않습니다/);
  assert.doesNotMatch(source, /evidence\.length >= 2/);
  assert.doesNotMatch(source, /distinctSources >= 2/);
});

test("Publish requires structural readiness plus explicit curator confirmation", async () => {
  const source = await read("app/components/curator-problem-editor.js");
  const statusRoute = await read("app/api/radar/admin/problems/[publicProblemId]/status/route.js");

  assert.match(source, /publicationConfirmed/);
  assert.match(source, /disabled=\{!publishReady \|\| !publicationConfirmed \|\| Boolean\(busy\)\}/);
  assert.match(source, /body\.publication_confirmed = publicationConfirmed/);
  assert.match(source, /Incident lineage와 공개 Evidence를 직접 검토했으며 이 Problem을 공개할 의사가 있습니다/);
  assert.match(statusRoute, /body\.publication_confirmed !== true/);
  assert.match(statusRoute, /publication_confirmation_required/);
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
