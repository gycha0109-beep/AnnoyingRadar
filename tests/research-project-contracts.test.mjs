import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_PROJECT_STATUSES,
  normalizeResearchProjectCreate,
  normalizeResearchProjectIdeaLinkRequest,
  normalizeResearchProjectListStatus,
  normalizeResearchProjectPatch,
  normalizeResearchProjectProblemLinkRequest,
  normalizeResearchProjectStatusRequest,
} from "../lib/research-projects/contracts.mjs";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";

test("Research Project lifecycle is minimal and separate", () => {
  assert.deepEqual(RESEARCH_PROJECT_STATUSES, ["active", "archived"]);
  assert.equal(normalizeResearchProjectListStatus(undefined), "active");
  assert.equal(normalizeResearchProjectListStatus("archived"), "archived");
  assert.equal(normalizeResearchProjectListStatus("all"), "all");
  assert.throws(() => normalizeResearchProjectListStatus("paused"), /Invalid Research Project status/);
});

test("Research Project creation keeps metadata minimal and supports transactional Saved Problem seeding", () => {
  assert.deepEqual(
    normalizeResearchProjectCreate({
      title: "  Freelancer payments  ",
      purpose: "  investigate repeated collection pain  ",
      initial_problem_candidate_id: PROJECT_ID.toUpperCase(),
    }),
    {
      title: "Freelancer payments",
      purpose: "investigate repeated collection pain",
      initial_problem_candidate_id: PROJECT_ID,
    },
  );

  assert.deepEqual(normalizeResearchProjectCreate({ title: "Payments" }), {
    title: "Payments",
    purpose: null,
    initial_problem_candidate_id: null,
  });
  assert.throws(() => normalizeResearchProjectCreate({ title: "" }), /1 to 200/);
  assert.throws(() => normalizeResearchProjectCreate({ title: "x", category: "finance" }), /Unsupported Research Project create field/);
});

test("Research Project metadata patch excludes lifecycle and membership", () => {
  assert.deepEqual(normalizeResearchProjectPatch({ title: "  New name  ", purpose: "" }), {
    title: "New name",
    purpose: null,
  });
  assert.throws(() => normalizeResearchProjectPatch({ status: "archived" }), /Unsupported Research Project patch field/);
  assert.throws(() => normalizeResearchProjectPatch({ project_id: PROJECT_ID }), /Unsupported Research Project patch field/);
  assert.throws(() => normalizeResearchProjectPatch({}), /must contain title or purpose/);
});

test("Research Project status request only allows active/archive transitions", () => {
  assert.equal(normalizeResearchProjectStatusRequest({ status: "archived" }, "active"), "archived");
  assert.equal(normalizeResearchProjectStatusRequest({ status: "active" }, "archived"), "active");
  assert.throws(() => normalizeResearchProjectStatusRequest({ status: "active" }, "active"), /must change status/);
  assert.throws(() => normalizeResearchProjectStatusRequest({ status: "paused" }, "active"), /Invalid Research Project status/);
  assert.throws(() => normalizeResearchProjectStatusRequest({ status: "archived", title: "x" }, "active"), /Unsupported Research Project status request field/);
});

test("Problem and Idea membership requests remain typed and explicit", () => {
  assert.equal(
    normalizeResearchProjectProblemLinkRequest({ problem_candidate_id: PROJECT_ID }),
    PROJECT_ID,
  );
  assert.equal(
    normalizeResearchProjectIdeaLinkRequest({ idea_candidate_id: PROJECT_ID }),
    PROJECT_ID,
  );
  assert.throws(
    () => normalizeResearchProjectProblemLinkRequest({ problem_candidate_id: PROJECT_ID, idea_candidate_id: PROJECT_ID }),
    /Unsupported Research Project problem_candidate_id link request field/,
  );
  assert.throws(
    () => normalizeResearchProjectIdeaLinkRequest({ idea_candidate_id: "not-a-uuid" }),
    /must be a UUID/,
  );
});
