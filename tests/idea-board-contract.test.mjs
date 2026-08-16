import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  IDEA_STATUSES,
  canTransitionIdeaStatus,
} from "../lib/ideas/contracts.mjs";

const ROOT = process.cwd();

test("Idea Board lanes are exactly the canonical Idea Candidate lifecycle", () => {
  assert.deepEqual(IDEA_STATUSES, [
    "candidate",
    "researching",
    "build_soon",
    "paused",
    "discarded",
    "archived",
  ]);
  assert.equal(canTransitionIdeaStatus("candidate", "researching"), true);
  assert.equal(canTransitionIdeaStatus("discarded", "build_soon"), false);
  assert.equal(canTransitionIdeaStatus("archived", "researching"), true);
});

test("Board mutation reuses the existing canonical status endpoint", async () => {
  const board = await read("app/ideas/idea-board.js");
  const statusRoute = await read("app/api/idea-candidates/[ideaId]/status/route.js");

  assert.match(board, /IDEA_STATUSES/);
  assert.match(board, /canTransitionIdeaStatus/);
  assert.match(board, /fetch\(`\/api\/idea-candidates\/\$\{ideaId\}\/status`/);
  assert.match(board, /method:\s*"PATCH"/);
  assert.match(board, /optimistic rollback|last known board state/i);

  assert.match(statusRoute, /normalizeIdeaStatusRequest/);
  assert.match(statusRoute, /ar_set_idea_candidate_status/);
  assert.match(statusRoute, /p_user_id:\s*userId/);
  assert.doesNotMatch(board, /board_status|project_idea_status/);
});

test("Project selection filters membership without owning Idea lifecycle", async () => {
  const service = await read("lib/ideas/board-service.mjs");
  const page = await read("app/ideas/page.js");
  const projectPage = await read("app/projects/[projectId]/page.js");

  assert.match(service, /ar_research_project_idea_links/);
  assert.match(service, /\.eq\("project_id", projectId\)/);
  assert.match(service, /ar_idea_candidates/);
  assert.match(service, /projectsByIdea/);
  assert.doesNotMatch(service, /loadProjectsForIdea/);
  assert.doesNotMatch(service, /update\(|rpc\(/);

  assert.match(page, /loadIdeaBoardOverview/);
  assert.match(page, /selectedProjectId/);
  assert.match(page, /const boardKey = board\.selected_project\?\.id \?\? "all"/);
  assert.match(page, /key=\{boardKey\}/);
  assert.match(page, /Project는 필터링 컨텍스트/);
  assert.match(projectPage, /\/ideas\?project=/);
});

test("Board does not reinterpret generation order_index as Kanban position", async () => {
  const board = await read("app/ideas/idea-board.js");
  const boardService = await read("lib/ideas/board-service.mjs");

  assert.doesNotMatch(board, /order_index|board_position|rank|score/i);
  assert.doesNotMatch(boardService, /order_index|board_position|rank|score/i);
  assert.match(board, /compareByRecentUpdate/);
  assert.match(board, /updated_at/);
});

test("Board keeps drag-and-drop optional with a status select fallback", async () => {
  const board = await read("app/ideas/idea-board.js");

  assert.match(board, /draggable=\{!pending\}/);
  assert.match(board, /onDragStart/);
  assert.match(board, /onDrop/);
  assert.match(board, /상태 이동/);
  assert.match(board, /<select/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
