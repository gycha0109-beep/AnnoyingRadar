import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  groupRoute: "app/api/raw-inputs/[rawInputId]/candidates/group/route.js",
  listRoute: "app/api/raw-inputs/[rawInputId]/candidates/route.js",
  ui: "app/raw-inputs/[rawInputId]/candidate-grouping.js",
  page: "app/raw-inputs/[rawInputId]/page.js",
  grouper: "lib/candidates/openai-grouper.mjs",
  service: "lib/candidates/service.mjs",
  migration: "supabase/migrations/008_candidate_grouping.sql",
  env: ".env.local.example",
};

test("Phase 4 group route preserves auth, owner, attempt and guarded RPC boundaries", async () => {
  const route = await readFile(files.groupRoute, "utf8");
  assert.match(route, /requireUser\(\)/);
  assert.match(route, /assertRawInputOwner/);
  assert.match(route, /randomUUID\(\)/);
  assert.match(route, /ar_begin_candidate_grouping/);
  assert.match(route, /ar_complete_candidate_grouping/);
  assert.match(route, /ar_fail_candidate_grouping/);
  assert.match(route, /buildSafetyIdentifier/);
});

test("Candidate provider uses strict schema, opaque refs and complete partition validation", async () => {
  const grouper = await readFile(files.grouper, "utf8");
  assert.match(grouper, /store: false/);
  assert.match(grouper, /type: "json_schema"/);
  assert.match(grouper, /strict: true/);
  assert.match(grouper, /padStart\(3, "0"\)/);
  assert.match(grouper, /Every confirmed Evidence must appear exactly once/);
  assert.doesNotMatch(grouper, /NEXT_PUBLIC_OPENAI/);
});

test("DB migration makes Candidate and Link persistence atomic and service-role guarded", async () => {
  const migration = await readFile(files.migration, "utf8");
  assert.match(migration, /grouping_attempt_id/);
  assert.match(migration, /Stale or invalid grouping attempt/);
  assert.match(migration, /Every confirmed Evidence must appear exactly once across Candidates/);
  assert.match(migration, /Confirmed Evidence cannot appear in multiple Candidates/);
  assert.match(migration, /insert into public\.ar_problem_candidates/);
  assert.match(migration, /insert into public\.ar_problem_evidence_links/);
  assert.match(migration, /analysis_status = 'reviewing_candidates'/);
  assert.match(migration, /revoke all on function public\.ar_create_problem_candidates_from_grouping[^;]+service_role/);
  assert.match(migration, /grant execute on function public\.ar_complete_candidate_grouping[^;]+service_role/);
});

test("Candidate read model and UI expose linked Evidence and automatic grouping progression", async () => {
  const listRoute = await readFile(files.listRoute, "utf8");
  const service = await readFile(files.service, "utf8");
  const ui = await readFile(files.ui, "utf8");
  const page = await readFile(files.page, "utf8");
  const env = await readFile(files.env, "utf8");

  assert.match(listRoute, /loadCandidateReview/);
  assert.match(service, /ar_problem_evidence_links/);
  assert.match(service, /evidences:/);
  assert.match(ui, /Problem Candidate 생성/);
  assert.match(ui, /setInterval/);
  assert.match(ui, /reviewing_candidates/);
  assert.match(page, /CandidateGrouping/);
  assert.match(env, /OPENAI_CANDIDATE_MODEL/);
});
