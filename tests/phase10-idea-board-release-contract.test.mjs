import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("Phase 10 is an application projection and introduces no Idea Board schema", async () => {
  const migrations = await readdir(path.join(ROOT, "supabase", "migrations"));
  const boardMigrations = migrations.filter((filename) => /idea.*board|board.*idea/i.test(filename));
  assert.deepEqual(boardMigrations, []);

  const board = await read("app/ideas/idea-board.js");
  const boardService = await read("lib/ideas/board-service.mjs");
  for (const source of [board, boardService]) {
    assert.doesNotMatch(source, /ar_idea_boards|ar_idea_board_items|board_status|project_idea_status/);
  }
});

test("Phase 10 preserves canonical Idea status mutation and status history", async () => {
  const migration = await read("supabase/migrations/011_idea_candidate_foundation.sql");
  const statusRoute = await read("app/api/idea-candidates/[ideaId]/status/route.js");
  const board = await read("app/ideas/idea-board.js");

  assert.match(migration, /create or replace function public\.ar_set_idea_candidate_status/);
  assert.match(migration, /insert into public\.ar_idea_candidate_status_events/);
  assert.match(statusRoute, /ar_set_idea_candidate_status/);
  assert.match(board, /\/status/);
  assert.doesNotMatch(board, /ar_set_idea_candidate_status/);
});

test("Phase 10 keeps Board and Idea detail responsibilities separate", async () => {
  const board = await read("app/ideas/idea-board.js");
  const detail = await read("app/idea-candidates/[ideaId]/idea-review.js");

  assert.match(board, /IdeaCard/);
  assert.match(board, /Problem Card:/);
  assert.match(board, /Research Project/);
  assert.doesNotMatch(board, /first_build_scope|excluded_scope|monetization_hint|first_screen_idea|memo/);

  assert.match(detail, /Idea 내용 검토·수정/);
  assert.match(detail, /first_build_scope/);
  assert.match(detail, /monetization_hint/);
  assert.match(detail, /memo/);
});

test("Phase 10 leaves Research Project membership independent from Idea status", async () => {
  const projectMigration = await read("supabase/migrations/015_research_project_foundation.sql");
  const boardService = await read("lib/ideas/board-service.mjs");

  assert.match(projectMigration, /primary key \(project_id, idea_candidate_id\)/i);
  assert.doesNotMatch(projectMigration, /project_idea_status|board_status/i);
  assert.match(boardService, /ar_research_project_idea_links/);
  assert.doesNotMatch(boardService, /set status|update public|rpc\(/i);
});

test("Phase 10 does not expand into ranking or project management", async () => {
  const board = await read("app/ideas/idea-board.js");
  const page = await read("app/ideas/page.js");

  assert.doesNotMatch(board, /priority[_ -]?score|market[_ -]?score|business[_ -]?score|wip limit|sprint|deadline|assignee/i);
  assert.doesNotMatch(page, /priority[_ -]?score|market[_ -]?score|business[_ -]?score|wip limit|sprint|deadline|assignee/i);
  assert.match(page, /점수·순위를 만들지 않습니다/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
