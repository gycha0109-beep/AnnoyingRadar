import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/015_research_project_foundation.sql";

test("Phase 9 migration adds an independent project identity with typed N:M links", async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /create table if not exists public\.ar_research_projects/i);
  assert.match(migration, /status in \('active', 'archived'\)/i);
  assert.doesNotMatch(migration, /status in \([^)]*paused/i);

  assert.match(migration, /create table if not exists public\.ar_research_project_problem_links/i);
  assert.match(migration, /primary key \(project_id, problem_candidate_id\)/i);
  assert.match(migration, /references public\.ar_saved_problem_cards\(problem_candidate_id\)/i);

  assert.match(migration, /create table if not exists public\.ar_research_project_idea_links/i);
  assert.match(migration, /primary key \(project_id, idea_candidate_id\)/i);
  assert.match(migration, /references public\.ar_idea_candidates\(id\)/i);

  assert.doesNotMatch(migration, /alter table public\.ar_problem_candidates\s+add/i);
  assert.doesNotMatch(migration, /alter table public\.ar_saved_problem_cards\s+add/i);
  assert.doesNotMatch(migration, /alter table public\.ar_idea_candidates\s+add/i);
});

test("Problem membership requires active Saved Problem while Idea membership stays explicit", async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /Only an active Saved Problem can be newly linked to a Research Project/i);
  assert.match(migration, /requires a confirmed Problem Card/i);
  assert.match(migration, /requires a completed source analysis/i);
  assert.match(migration, /ar_link_research_project_problem/i);
  assert.match(migration, /ar_link_research_project_idea/i);
  assert.doesNotMatch(migration, /Idea Candidate.*Saved Problem/s);
});

test("Project archive is independent and unlink deletes association rows only", async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /ar_set_research_project_status/i);
  assert.match(migration, /update public\.ar_research_projects\s+set status = p_target_status/is);
  assert.doesNotMatch(migration, /update public\.ar_problem_candidates\s+set status/is);
  assert.doesNotMatch(migration, /update public\.ar_idea_candidates\s+set status/is);
  assert.doesNotMatch(migration, /update public\.ar_saved_problem_cards\s+set status/is);

  assert.match(migration, /delete from public\.ar_research_project_problem_links/i);
  assert.match(migration, /delete from public\.ar_research_project_idea_links/i);
  assert.doesNotMatch(migration, /delete from public\.ar_research_projects/i);
  assert.doesNotMatch(migration, /delete from public\.ar_problem_candidates/i);
  assert.doesNotMatch(migration, /delete from public\.ar_idea_candidates/i);
});

test("Research Project tables keep owner-scoped reads and service-role-only writes", async () => {
  const migration = await read(MIGRATION);

  for (const table of [
    "ar_research_projects",
    "ar_research_project_problem_links",
    "ar_research_project_idea_links",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated, service_role`, "i"));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated, service_role`, "i"));
  }

  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  for (const rpc of [
    "ar_create_research_project",
    "ar_create_research_project_with_problem",
    "ar_update_research_project_metadata",
    "ar_set_research_project_status",
    "ar_link_research_project_problem",
    "ar_unlink_research_project_problem",
    "ar_link_research_project_idea",
    "ar_unlink_research_project_idea",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}\\(`, "i"));
  }
});

test("Project APIs split metadata, lifecycle and typed link mutations", async () => {
  const detailRoute = await read("app/api/research-projects/[projectId]/route.js");
  const statusRoute = await read("app/api/research-projects/[projectId]/status/route.js");
  const problemRoute = await read("app/api/research-projects/[projectId]/problems/route.js");
  const ideaRoute = await read("app/api/research-projects/[projectId]/ideas/route.js");

  for (const source of [detailRoute, statusRoute, problemRoute, ideaRoute]) {
    assert.match(source, /requireUser\s*\(/);
    assert.match(source, /assertResearchProjectOwner\s*\(/);
    assert.match(source, /p_user_id\s*:\s*userId/);
  }

  assert.match(detailRoute, /normalizeResearchProjectPatch/);
  assert.match(detailRoute, /ar_update_research_project_metadata/);
  assert.doesNotMatch(detailRoute, /ar_set_research_project_status/);
  assert.doesNotMatch(detailRoute, /export async function DELETE/);

  assert.match(statusRoute, /normalizeResearchProjectStatusRequest/);
  assert.match(statusRoute, /ar_set_research_project_status/);
  assert.doesNotMatch(statusRoute, /ar_update_research_project_metadata/);

  assert.match(problemRoute, /loadSavedProblemByCandidate/);
  assert.match(problemRoute, /ar_link_research_project_problem/);
  assert.match(ideaRoute, /assertIdeaOwner/);
  assert.match(ideaRoute, /ar_link_research_project_idea/);
  assert.doesNotMatch(ideaRoute, /loadSavedProblemByCandidate/);
});

test("Phase 9 Project UI stays a grouping layer even when later phases evolve /ideas", async () => {
  const home = await read("app/page.js");
  const projects = await read("app/projects/page.js");
  const projectDetail = await read("app/projects/[projectId]/project-detail.js");
  const problems = await read("app/problems/page.js");
  const problemPage = await read("app/problem-candidates/[candidateId]/page.js");
  const ideaPage = await read("app/idea-candidates/[ideaId]/page.js");

  assert.match(home, /RawInputDashboard/);
  assert.match(home, /href="\/projects"/);
  assert.match(projects, /Research Projects/);
  assert.match(projectDetail, /연결된 Saved Problem/);
  assert.match(projectDetail, /연결된 Idea Candidate/);
  assert.match(problems, /ProjectLinkControl/);
  assert.match(problemPage, /ResearchProjectPanel/);
  assert.match(ideaPage, /ResearchProjectPanel/);
  assert.doesNotMatch(projectDetail, /Kanban|Sprint|Deadline|Progress %/i);
  assert.doesNotMatch(projectDetail, /project_idea_status|board_status/i);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
