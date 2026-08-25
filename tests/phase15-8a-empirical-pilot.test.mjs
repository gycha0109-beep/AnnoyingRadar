import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("source discovery pilot is bounded, main-authoritative, and never runs on pull_request", async () => {
  const workflow = await read(".github/workflows/source-discovery-pilot.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ops\/source-discovery-pilot/);
  assert.match(workflow, /\.ops\/source-discovery-pilot-trigger\.txt/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /ALLOW_SOURCE_DISCOVERY_EXPANSION: "1"/);
  assert.match(workflow, /--live --max-requests=/);
  assert.match(workflow, /default: "12"/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});

test("pilot workflow consumes only server-side acquisition and database credentials", async () => {
  const workflow = await read(".github/workflows/source-discovery-pilot.yml");
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NAVER_CLIENT_ID",
    "NAVER_CLIENT_SECRET",
  ]) assert.match(workflow, new RegExp(`secrets\\.${name}`));
});
