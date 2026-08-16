import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_PROBLEM_STATUSES,
  normalizeSavedProblemListStatus,
  normalizeSavedProblemPatch,
  normalizeSavedProblemStatusRequest,
  savedProblemEligibility,
} from "../lib/saved-problems/contracts.mjs";

test("Saved Problem status vocabulary is separate and frozen", () => {
  assert.deepEqual(SAVED_PROBLEM_STATUSES, ["active", "archived"]);
  assert.equal(normalizeSavedProblemListStatus(undefined), "active");
  assert.equal(normalizeSavedProblemListStatus("archived"), "archived");
  assert.equal(normalizeSavedProblemListStatus("all"), "all");
  assert.throws(() => normalizeSavedProblemListStatus("discarded"), /Invalid Saved Problem status/);
});

test("Saved Problem metadata patch accepts only user-authored category and memo", () => {
  assert.deepEqual(
    normalizeSavedProblemPatch({ category: "  productivity  ", memo: "  revisit next week  " }),
    { category: "productivity", memo: "revisit next week" },
  );
  assert.deepEqual(normalizeSavedProblemPatch({ category: "", memo: null }), {
    category: null,
    memo: null,
  });
  assert.throws(() => normalizeSavedProblemPatch({ status: "archived" }), /Unsupported Saved Problem field/);
  assert.throws(() => normalizeSavedProblemPatch({ problem_candidate_id: "x" }), /Unsupported Saved Problem field/);
  assert.throws(() => normalizeSavedProblemPatch({ category: "x".repeat(121) }), /at most 120/);
  assert.throws(() => normalizeSavedProblemPatch({ memo: "x".repeat(4001) }), /at most 4000/);
});

test("Saved Problem status request is a dedicated active/archive transition", () => {
  assert.equal(normalizeSavedProblemStatusRequest({ status: "archived" }, "active"), "archived");
  assert.equal(normalizeSavedProblemStatusRequest({ status: "active" }, "archived"), "active");
  assert.throws(
    () => normalizeSavedProblemStatusRequest({ status: "active" }, "active"),
    /must change status/,
  );
  assert.throws(
    () => normalizeSavedProblemStatusRequest({ status: "archived", memo: "x" }, "active"),
    /contain only status/,
  );
});

test("Saved Problem eligibility reuses the stable confirmed/completed Problem Card boundary", () => {
  const candidate = { status: "confirmed", evidence_count: 2 };
  const rawInput = { analysis_status: "completed" };
  assert.deepEqual(savedProblemEligibility(candidate, rawInput), { eligible: true, reason: null });
  assert.equal(savedProblemEligibility({ ...candidate, status: "draft" }, rawInput).reason, "confirmed_problem_card_required");
  assert.equal(savedProblemEligibility(candidate, { analysis_status: "reviewing_candidates" }).reason, "completed_analysis_required");
  assert.equal(savedProblemEligibility({ ...candidate, evidence_count: 0 }, rawInput).reason, "problem_card_evidence_required");
});
