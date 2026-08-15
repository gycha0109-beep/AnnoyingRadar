import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeIdeaStatusRequest } from "../lib/ideas/review-api.mjs";

const migration = await readFile(
  new URL("../supabase/migrations/012_idea_review_edit_guard.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = await readFile(
  new URL("../supabase/migrations/013_idea_review_edit_guard_hardening.sql", import.meta.url),
  "utf8",
);
const detailRoute = await readFile(
  new URL("../app/api/idea-candidates/[ideaId]/route.js", import.meta.url),
  "utf8",
);
const statusRoute = await readFile(
  new URL("../app/api/idea-candidates/[ideaId]/status/route.js", import.meta.url),
  "utf8",
);
const ideaReview = await readFile(
  new URL("../app/idea-candidates/[ideaId]/idea-review.js", import.meta.url),
  "utf8",
);
const problemCardPage = await readFile(
  new URL("../app/problem-candidates/[candidateId]/page.js", import.meta.url),
  "utf8",
);
const ideaSection = await readFile(
  new URL("../app/problem-candidates/[candidateId]/idea-section.js", import.meta.url),
  "utf8",
);
const ideasPage = await readFile(new URL("../app/ideas/page.js", import.meta.url), "utf8");
const ideaService = await readFile(new URL("../lib/ideas/service.mjs", import.meta.url), "utf8");

test("inactive Idea Candidates are read-only at the database boundary", () => {
  assert.match(migration, /old\.status in \('discarded', 'archived'\)/);
  assert.match(migration, /before update on public\.ar_idea_candidates/);
  assert.match(hardeningMigration, /new\.status = old\.status/);
  assert.match(hardeningMigration, /must be restored before editing/);
  assert.match(hardeningMigration, /status transition must not edit content or source identity/);
  assert.match(hardeningMigration, /is distinct from/);
});

test("Idea content API keeps edit and status mutation separated", () => {
  assert.match(detailRoute, /normalizeIdeaCandidatePatch/);
  assert.match(detailRoute, /assertIdeaOwner/);
  assert.match(detailRoute, /current\.status === "discarded" \|\| current\.status === "archived"/);
  assert.match(detailRoute, /ar_update_idea_candidate/);
  assert.doesNotMatch(detailRoute, /ar_set_idea_candidate_status/);

  assert.match(statusRoute, /normalizeIdeaStatusRequest/);
  assert.match(statusRoute, /ar_set_idea_candidate_status/);
  assert.doesNotMatch(statusRoute, /ar_update_idea_candidate/);
});

test("status request is strict and follows the Phase 7 transition graph", () => {
  assert.equal(normalizeIdeaStatusRequest({ status: "researching" }, "candidate"), "researching");
  assert.equal(normalizeIdeaStatusRequest({ status: "candidate" }, "discarded"), "candidate");
  assert.throws(
    () => normalizeIdeaStatusRequest({ status: "build_soon" }, "discarded"),
    /Invalid Idea Candidate status transition/,
  );
  assert.throws(
    () => normalizeIdeaStatusRequest({ status: "paused", extra: true }, "candidate"),
    /must contain only status/,
  );
});

test("Problem Card exposes append-only Idea generation only at the completed confirmed boundary", () => {
  assert.match(problemCardPage, /ProblemCardIdeas/);
  assert.match(ideaSection, /candidate\?\.status === "confirmed"/);
  assert.match(ideaSection, /rawInput\?\.analysis_status === "completed"/);
  assert.match(ideaSection, /evidence_count/);
  assert.match(ideaSection, /\/ideas\/generate/);
  assert.match(ideaSection, /아이디어 추가 생성/);
  assert.match(ideaSection, /\/idea-candidates\/\$\{idea\.id\}/);
  assert.doesNotMatch(ideaSection, /\.from\("ar_idea_candidates"\)/);
});

test("Idea detail UX covers content, provenance, evidence, and status history", () => {
  for (const field of [
    "one_liner",
    "target_user",
    "problem_statement",
    "core_value",
    "first_build_scope",
    "excluded_scope",
    "implementation_difficulty",
    "monetization_hint",
    "first_screen_idea",
    "memo",
  ]) {
    assert.match(ideaReview, new RegExp(field));
  }
  assert.match(ideaReview, /Source Traceability/);
  assert.match(ideaReview, /Generation Provenance/);
  assert.match(ideaReview, /Status History/);
  assert.match(ideaReview, /\/status/);
  assert.doesNotMatch(ideaReview, /\.from\("ar_idea_candidates"\)/);
});

test("global Ideas page stays a lightweight owner-scoped list", () => {
  assert.match(ideasPage, /loadIdeaOverview/);
  assert.match(ideasPage, /Idea Candidate \{ideas\.length\}개/);
  assert.match(ideasPage, /problem_card\?\.title/);
  assert.doesNotMatch(ideasPage, /kanban|ranking|score/i);
  assert.match(ideaService, /\.eq\("user_id", userId\)/);
});