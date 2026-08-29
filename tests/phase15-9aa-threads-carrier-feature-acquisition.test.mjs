import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9AA freezes four carrier-feature queries across TOP and RECENT", async () => {
  const plan = await read("lib/sources/phase15-9aa-threads-carrier-feature-plan.mjs");
  for (const query of [
    "자급제 채팅플러스",
    "자급제 투폰",
    "자급제 넘버플러스",
    "CSC 변경 기능",
  ]) assert.match(plan, new RegExp(query));
  assert.match(plan, /\["TOP", "RECENT"\]/);
  assert.match(plan, /PHASE15_9AA_QUERY_LIMIT = 50/);
  assert.match(plan, /PHASE15_9AA_MAX_REQUESTS = 8/);
  assert.match(plan, /source_platform: PHASE15_9AA_SOURCE_PLATFORM/);
  assert.match(plan, /post_campaign_database_readback/);
});

test("15.9AA uses the existing Threads adapter without changing core acquisition authority", async () => {
  const script = await read("scripts/run-threads-carrier-feature-acquisition-15-9aa.mjs");
  assert.match(script, /searchThreadsPosts/);
  assert.match(script, /threads_carrier_feature_campaign_version/);
  assert.match(script, /campaign already executed; duplicate live run forbidden/);
  assert.match(script, /PHASE15_9AA_PROTECTED_INCIDENT_KEY/);
  assert.match(script, /exactly two Sources linked to the existing CSC Incident/);
  assert.match(script, /existing CSC Incident must remain outside Public Evidence/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9AA fails before database access when the Threads credential is absent", async () => {
  const script = await read("scripts/run-threads-carrier-feature-acquisition-15-9aa.mjs");
  const credentialGuard = script.indexOf("if (!process.env.THREADS_ACCESS_TOKEN)");
  const clientCreation = script.indexOf("const client = createServiceClient()");
  assert.ok(credentialGuard >= 0);
  assert.ok(clientCreation > credentialGuard);
  assert.match(script, /THREADS_ACCESS_TOKEN is required/);
});

test("15.9AA writes only Source acquisition supply and freezes downstream domains", async () => {
  const script = await read("scripts/run-threads-carrier-feature-acquisition-15-9aa.mjs");
  assert.match(script, /createSourceIngestionRun/);
  assert.match(script, /persistDiscoveredSourceSignals/);
  assert.match(script, /full_context_mutations: 0/);
  assert.match(script, /formation_mutations: 0/);
  assert.match(script, /incident_mutations: 0/);
  assert.match(script, /public_problem_mutations: 0/);
  assert.match(script, /publication_mutations: 0/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome/);
  assert.doesNotMatch(script, /persistSourceFormationAssessment/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9AA artifact hashes provider identity and exposes no raw Threads identity or body", async () => {
  const script = await read("scripts/run-threads-carrier-feature-acquisition-15-9aa.mjs");
  assert.match(script, /source_external_identity_sha256/);
  assert.match(script, /source_content_sha256/);
  assert.match(script, /admission_decision/);
  assert.match(script, /canonical_followup_authority: "post_campaign_database_readback"/);
  for (const forbidden of [
    "external_content_id",
    "source_signal_id",
    "canonical_url",
    "source_url",
    "author_handle",
    "raw_text",
    "incident_id",
    "curator_user_id",
    "public_problem_id",
    "provider_request_id",
    "THREADS_ACCESS_TOKEN",
  ]) assert.match(script, new RegExp(`\\"${forbidden}`));
});

test("15.9AA temporary workflow waits for successful merged-main CI and validates Threads secret", async () => {
  const workflow = await read(".github/workflows/source-threads-carrier-feature-acquisition-15-9aa.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /THREADS_ACCESS_TOKEN: \$\{\{ secrets\.THREADS_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9AA_THREADS_CARRIER_FEATURE_ACQUISITION: "true"/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});
