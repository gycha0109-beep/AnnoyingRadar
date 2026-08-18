import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const SAVE_ROUTE = "app/api/problem-candidates/[candidateId]/save/route.js";
const STATUS_ROUTE = "app/api/problem-candidates/[candidateId]/save/status/route.js";

test("Saved Problem migration keeps Problem Card identity and direct writes separated", async () => {
  const migration = await read("supabase/migrations/014_saved_problem_library.sql");
  assert.match(migration, /create table if not exists public\.ar_saved_problem_cards/i);
  assert.match(migration, /problem_candidate_id uuid primary key/i);
  assert.match(migration, /references public\.ar_problem_candidates\(id\)/i);
  assert.match(migration, /status in \('active', 'archived'\)/i);
  assert.match(migration, /requires a confirmed Problem Card/i);
  assert.match(migration, /requires a completed source analysis/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.ar_saved_problem_cards from anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.ar_saved_problem_cards to authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.ar_save_problem_card\(uuid, uuid\)\s+to service_role/i);
  assert.match(migration, /grant execute on function public\.ar_update_saved_problem_metadata\(uuid, uuid, jsonb\)\s+to service_role/i);
  assert.match(migration, /grant execute on function public\.ar_set_saved_problem_status\(uuid, uuid, text\)\s+to service_role/i);
  assert.doesNotMatch(migration, /delete from public\.ar_saved_problem_cards/i);
});

test("Saved Problem mutation APIs authenticate, owner-scope and split metadata from lifecycle", async () => {
  const saveRoute = await read(SAVE_ROUTE);
  const statusRoute = await read(STATUS_ROUTE);

  for (const [relativePath, source] of [[SAVE_ROUTE, saveRoute], [STATUS_ROUTE, statusRoute]]) {
    assert.match(source, /requireUser\s*\(/, `${relativePath}: authentication`);
    assert.match(source, /assertCandidateOwner\s*\(/, `${relativePath}: Problem Card owner check`);
    assert.match(source, /p_user_id\s*:\s*userId/, `${relativePath}: RPC user scope`);
    assert.doesNotMatch(source, /export async function DELETE/);
  }

  assert.match(saveRoute, /normalizeSavedProblemPatch/);
  assert.match(saveRoute, /ar_update_saved_problem_metadata/);
  assert.doesNotMatch(saveRoute, /ar_set_saved_problem_status/);

  assert.match(statusRoute, /normalizeSavedProblemStatusRequest/);
  assert.match(statusRoute, /ar_set_saved_problem_status/);
  assert.doesNotMatch(statusRoute, /ar_update_saved_problem_metadata/);
});

test("Saved Problem list remains owner scoped and defaults to active state", async () => {
  const route = await read("app/api/saved-problems/route.js");
  const service = await read("lib/saved-problems/service.mjs");
  assert.match(route, /requireUser\s*\(/);
  assert.match(route, /normalizeSavedProblemListStatus/);
  assert.match(service, /\.eq\("user_id", userId\)/);
  assert.match(service, /status = "active"/);
  assert.match(service, /\.eq\("status", status\)/);
});

test("Saved Problem library remains available from Personal Workspace without replacing Public Radar", async () => {
  const home = await read("app/page.js");
  const workspace = await read("app/components/personal-workspace.js");
  const problemPage = await read("app/problem-candidates/[candidateId]/page.js");
  const savedPanel = await read("app/problem-candidates/[candidateId]/saved-problem-panel.js");
  const ideas = await read("app/problem-candidates/[candidateId]/problem-card-ideas.js");

  assert.match(home, /Problem Discovery Radar/);
  assert.match(home, /href="\/workspace"/);
  assert.match(workspace, /href="\/problems"/);
  assert.match(problemPage, /SavedProblemPanel/);
  assert.match(problemPage, /ProblemCardIdeas/);
  assert.match(savedPanel, /Problem Card 저장/);
  assert.match(savedPanel, /Saved Problem 메타데이터 저장/);
  assert.match(savedPanel, /Saved Problem 보관/);
  assert.match(savedPanel, /Saved Problem 복구/);
  assert.match(ideas, /IdeaSection/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
