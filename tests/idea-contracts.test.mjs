import assert from "node:assert/strict";
import test from "node:test";

import {
  IDEA_STATUSES,
  IMPLEMENTATION_DIFFICULTIES,
  canTransitionIdeaStatus,
  normalizeIdeaCandidatePatch,
  normalizeIdeaGenerationDrafts,
  normalizeIdeaStatus,
} from "../lib/ideas/contracts.mjs";

const validDraft = {
  title: "Return reminder for hard-to-track purchases",
  one_liner: "Warns users before return windows close.",
  target_user: "Online shoppers",
  problem_statement: "Users lose track of return deadlines.",
  core_value: "Reduce avoidable missed returns.",
  first_build_scope: "Manual purchase entry and deadline reminders.",
  excluded_scope: "No retailer account scraping.",
  implementation_difficulty: "low",
  monetization_hint: "Freemium reminder limits are a hypothesis.",
  first_screen_idea: "Upcoming return deadlines list.",
};

test("Idea status and difficulty vocabularies are frozen", () => {
  assert.deepEqual(IDEA_STATUSES, ["candidate", "researching", "build_soon", "paused", "discarded", "archived"]);
  assert.deepEqual(IMPLEMENTATION_DIFFICULTIES, ["low", "medium", "high", "unknown"]);
  assert.equal(normalizeIdeaStatus(" researching "), "researching");
  assert.throws(() => normalizeIdeaStatus("done"), /Invalid Idea Candidate status/);
});

test("Idea status transitions follow the Phase 7 lifecycle", () => {
  assert.equal(canTransitionIdeaStatus("candidate", "researching"), true);
  assert.equal(canTransitionIdeaStatus("discarded", "build_soon"), false);
  assert.equal(canTransitionIdeaStatus("discarded", "archived"), true);
  assert.equal(canTransitionIdeaStatus("archived", "paused"), true);
  assert.equal(canTransitionIdeaStatus("paused", "paused"), false);
});

test("Idea candidate patches exclude status and source identity", () => {
  assert.deepEqual(
    normalizeIdeaCandidatePatch({
      title: "  Edited idea  ",
      implementation_difficulty: "medium",
      memo: "  user note  ",
      order_index: 2,
    }),
    {
      title: "Edited idea",
      implementation_difficulty: "medium",
      memo: "user note",
      order_index: 2,
    },
  );
  assert.throws(() => normalizeIdeaCandidatePatch({ status: "researching" }), /Unsupported Idea Candidate field/);
  assert.throws(() => normalizeIdeaCandidatePatch({ problem_candidate_id: "x" }), /Unsupported Idea Candidate field/);
  assert.throws(() => normalizeIdeaCandidatePatch({ one_liner: null }), /one_liner must be a string/);
});

test("Generation drafts are strict, bounded, and normalized", () => {
  const normalized = normalizeIdeaGenerationDrafts([validDraft]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].title, validDraft.title);
  assert.throws(() => normalizeIdeaGenerationDrafts([]), /1 to 3 drafts/);
  assert.throws(() => normalizeIdeaGenerationDrafts([validDraft, validDraft, validDraft, validDraft]), /1 to 3 drafts/);
  assert.throws(
    () => normalizeIdeaGenerationDrafts([{ ...validDraft, implementation_difficulty: "extreme" }]),
    /Invalid implementation_difficulty/,
  );
  assert.throws(
    () => normalizeIdeaGenerationDrafts([{ ...validDraft, score: 99 }]),
    /unsupported field score/,
  );
});
