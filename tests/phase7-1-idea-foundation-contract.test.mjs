import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/011_idea_candidate_foundation.sql", import.meta.url),
  "utf8",
);
const contracts = await readFile(
  new URL("../lib/ideas/contracts.mjs", import.meta.url),
  "utf8",
);
const design = await readFile(
  new URL("../docs/phase7-idea-candidate-design.md", import.meta.url),
  "utf8",
);

test("Phase 7.1 creates the governed Idea persistence model", () => {
  for (const table of [
    "ar_idea_generation_batches",
    "ar_idea_candidates",
    "ar_idea_candidate_status_events",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /problem_candidate_id uuid not null references public\.ar_problem_candidates/);
  assert.match(migration, /first_screen_idea text/);
  assert.doesNotMatch(migration, /create table[^;]*problem_cards/i);
});

test("Phase 7.1 keeps writes behind service-only RPCs", () => {
  for (const fn of [
    "ar_persist_idea_generation_batch",
    "ar_update_idea_candidate",
    "ar_set_idea_candidate_status",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(migration, /revoke all on table public\.ar_idea_candidates from anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.ar_idea_candidates to authenticated, service_role/);
  assert.match(migration, /from public, anon, authenticated/g);
});

test("Phase 7.1 enforces completed confirmed source eligibility and append-only generation", () => {
  assert.match(migration, /Idea generation requires a confirmed Problem Card/);
  assert.match(migration, /Idea generation requires a completed source analysis/);
  assert.match(migration, /jsonb_array_length\(p_ideas\) not between 1 and 3/);
  assert.match(migration, /insert into public\.ar_idea_generation_batches/);
  assert.match(migration, /insert into public\.ar_idea_candidates/);
  assert.doesNotMatch(migration, /delete from public\.ar_idea_candidates/);
  assert.doesNotMatch(migration, /update public\.ar_raw_inputs/);
});

test("Phase 7.1 status lifecycle is categorical and history-bearing", () => {
  assert.match(migration, /candidate', 'researching', 'build_soon', 'paused', 'discarded', 'archived/);
  assert.match(migration, /insert into public\.ar_idea_candidate_status_events/);
  assert.match(migration, /Idea Candidate status transition must change status/);
  assert.match(contracts, /IMPLEMENTATION_DIFFICULTIES/);
  assert.match(contracts, /low/);
  assert.match(contracts, /unknown/);
  assert.doesNotMatch(contracts, /business_score|marketability_score|rank_score/);
});

test("Phase 7.1 remains inside the approved design boundary", () => {
  assert.match(design, /UC-10 문제를 아이디어 후보로 변환/);
  assert.match(design, /UC-11 아이디어 후보 상태 변경/);
  assert.match(design, /UC-12.*Research Project/);
  assert.match(design, /no project\/board\/report\/ranking scope leaks/i);
  assert.doesNotMatch(migration, /research_projects|reports/);
});
