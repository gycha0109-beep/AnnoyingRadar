import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/009_candidate_review.sql", import.meta.url),
  "utf8",
);
const listUi = await readFile(
  new URL("../app/raw-inputs/[rawInputId]/candidate-grouping.js", import.meta.url),
  "utf8",
);
const detailUi = await readFile(
  new URL("../app/problem-candidates/[candidateId]/candidate-review.js", import.meta.url),
  "utf8",
);

const routePaths = [
  "../app/api/problem-candidates/[candidateId]/route.js",
  "../app/api/problem-candidates/[candidateId]/confirm/route.js",
  "../app/api/problem-candidates/[candidateId]/discard/route.js",
  "../app/api/problem-candidates/[candidateId]/restore/route.js",
  "../app/api/problem-candidates/[candidateId]/evidence/route.js",
  "../app/api/problem-candidates/[candidateId]/merge/route.js",
  "../app/api/problem-candidates/[candidateId]/split/route.js",
  "../app/api/raw-inputs/[rawInputId]/complete/route.js",
];
const routes = await Promise.all(
  routePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

test("Phase 5 migration exposes only guarded review RPCs", () => {
  for (const name of [
    "ar_update_problem_candidate",
    "ar_set_problem_candidate_status",
    "ar_move_candidate_evidence",
    "ar_merge_problem_candidates",
    "ar_split_problem_candidate",
    "ar_complete_candidate_review",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.match(migration, /security definer/g);
  assert.match(migration, /reviewing_candidates/g);
  assert.match(migration, /At least one confirmed Problem Card is required/);
  assert.match(migration, /Resolve every draft Candidate/);
  assert.match(migration, /trg_ar_sync_problem_candidate_evidence_count/);
  assert.match(migration, /Evidence is already linked to another active Candidate/);
});

test("Phase 5 routes use ownership checks and RPC mutations", () => {
  const joined = routes.join("\n");
  assert.match(joined, /requireUser/);
  assert.match(joined, /assertCandidateOwner|assertRawInputOwner/);
  assert.match(joined, /ar_update_problem_candidate/);
  assert.match(joined, /ar_set_problem_candidate_status/);
  assert.match(joined, /ar_move_candidate_evidence/);
  assert.match(joined, /ar_merge_problem_candidates/);
  assert.match(joined, /ar_split_problem_candidate/);
  assert.match(joined, /ar_complete_candidate_review/);
  assert.doesNotMatch(joined, /\.from\("ar_problem_candidates"\)\s*\.update/);
});

test("Phase 5 UI distinguishes Candidate, Problem Card and discard history", () => {
  assert.match(listUi, /Problem Card/);
  assert.match(listUi, /Candidate 검토 완료/);
  assert.match(listUi, /폐기 기록/);
  assert.match(listUi, /draftCount === 0/);
  assert.match(detailUi, /수정 내용 저장/);
  assert.match(detailUi, /문제 카드로 확정/);
  assert.match(detailUi, /Evidence 이동/);
  assert.match(detailUi, /선택 Candidate에 병합/);
  assert.match(detailUi, /새 Candidate로 분리/);
  assert.match(detailUi, /완료된 분석은 읽기 전용/);
});
