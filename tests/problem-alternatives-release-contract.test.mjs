import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const COLLECTION_ROUTE = "app/api/problem-candidates/[candidateId]/alternatives/route.js";
const ITEM_ROUTE = "app/api/problem-candidates/[candidateId]/alternatives/[noteId]/route.js";

test("Phase 12 migration adds Problem-linked manual research notes with RPC-only writes", async () => {
  const migration = await read("supabase/migrations/016_problem_alternative_notes.sql");

  assert.match(migration, /create table if not exists public\.ar_problem_alternative_notes/i);
  assert.match(migration, /problem_candidate_id uuid not null[\s\S]*references public\.ar_problem_candidates\(id\)/i);
  assert.match(migration, /kind in \('service', 'alternative'\)/i);
  assert.match(migration, /requires a confirmed Problem Card/i);
  assert.match(migration, /requires a completed source analysis/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on table public\.ar_problem_alternative_notes from anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.ar_problem_alternative_notes to authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.ar_create_problem_alternative_note\(uuid, uuid, text, text, text, text\)\s+to service_role/i);
  assert.match(migration, /grant execute on function public\.ar_update_problem_alternative_note\(uuid, uuid, jsonb\)\s+to service_role/i);
  assert.match(migration, /grant execute on function public\.ar_delete_problem_alternative_note\(uuid, uuid\)\s+to service_role/i);
});

test("Phase 12 APIs authenticate, owner-scope and preserve nested Problem Card identity", async () => {
  const collection = await read(COLLECTION_ROUTE);
  const item = await read(ITEM_ROUTE);

  for (const [relativePath, source] of [[COLLECTION_ROUTE, collection], [ITEM_ROUTE, item]]) {
    assert.match(source, /requireUser\s*\(/, `${relativePath}: authentication`);
    assert.match(source, /assertCandidateOwner\s*\(/, `${relativePath}: candidate owner scope`);
    assert.match(source, /p_user_id\s*:\s*userId/, `${relativePath}: RPC user scope`);
  }

  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(collection, /normalizeProblemAlternativeCreate/);
  assert.match(collection, /ar_create_problem_alternative_note/);
  assert.match(collection, /candidate\.status !== "confirmed"/);

  assert.match(item, /loadProblemAlternativeNote\(serviceClient, candidateId, noteId, userId\)/);
  assert.match(item, /export async function PATCH/);
  assert.match(item, /export async function DELETE/);
  assert.match(item, /ar_update_problem_alternative_note/);
  assert.match(item, /ar_delete_problem_alternative_note/);
});

test("Phase 12 UI is manual research capture, not automatic competitor discovery", async () => {
  const page = await read("app/problem-candidates/[candidateId]/page.js");
  const panel = await read("app/problem-candidates/[candidateId]/alternative-notes-panel.js");
  const service = await read("lib/problem-alternatives/service.mjs");

  assert.match(page, /AlternativeNotesPanel/);
  assert.match(panel, /기존 서비스 \/ 대안/);
  assert.match(panel, /자동 검색 없이 직접 확인한 사실과 메모만 저장합니다/);
  assert.match(panel, /서비스 \/ 대안 추가/);
  assert.match(panel, /수정 저장/);
  assert.match(panel, /삭제 확정/);
  assert.doesNotMatch(panel, /OpenAI|web search|Google|Product Hunt/i);
  assert.match(service, /\.eq\("problem_candidate_id", problemCandidateId\)/);
  assert.match(service, /\.eq\("user_id", userId\)/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
