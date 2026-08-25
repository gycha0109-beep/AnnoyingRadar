import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("source discovery pilot is bounded, main-authoritative, and manual-only", async () => {
  const workflow = await read(".github/workflows/source-discovery-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /ops\/source-discovery-pilot/);
  assert.doesNotMatch(workflow, /\.ops\/source-discovery-pilot-trigger\.txt/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /ALLOW_SOURCE_DISCOVERY_EXPANSION: "1"/);
  assert.match(workflow, /--live --max-requests=/);
  assert.match(workflow, /default: "12"/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});

test("pilot workflow consumes only server-side acquisition and database credentials and names missing configuration safely", async () => {
  const workflow = await read(".github/workflows/source-discovery-pilot.yml");
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NAVER_CLIENT_ID",
    "NAVER_CLIENT_SECRET",
  ]) assert.match(workflow, new RegExp(`secrets\\.${name}`));
  assert.match(workflow, /Missing required GitHub Actions secret:/);
  assert.doesNotMatch(workflow, /echo .*\$NAVER_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /echo .*\$SUPABASE_SECRET_KEY/);
});
