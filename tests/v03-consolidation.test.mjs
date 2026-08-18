import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  MAX_SAVED_PROBLEM_CATEGORY_LENGTH,
  normalizeSavedProblemCategoryFilter,
  savedProblemLibraryHref,
  summarizeSavedProblemCategories,
} from "../lib/saved-problems/category.mjs";

const ROOT = process.cwd();

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("category filter normalizes a single exact category and rejects invalid values", () => {
  assert.equal(normalizeSavedProblemCategoryFilter("  생산성  "), "생산성");
  assert.equal(normalizeSavedProblemCategoryFilter(["개발도구", "ignored"]), "개발도구");
  assert.equal(normalizeSavedProblemCategoryFilter("   "), null);
  assert.equal(normalizeSavedProblemCategoryFilter(null), null);
  assert.equal(
    normalizeSavedProblemCategoryFilter("x".repeat(MAX_SAVED_PROBLEM_CATEGORY_LENGTH + 1)),
    null,
  );
});

test("Saved Problem library href preserves category across active/archive views", () => {
  assert.equal(savedProblemLibraryHref(), "/problems");
  assert.equal(
    savedProblemLibraryHref({ category: "개발 도구" }),
    "/problems?category=%EA%B0%9C%EB%B0%9C+%EB%8F%84%EA%B5%AC",
  );
  assert.equal(
    savedProblemLibraryHref({ status: "archived", category: "개발 도구" }),
    "/problems?status=archived&category=%EA%B0%9C%EB%B0%9C+%EB%8F%84%EA%B5%AC",
  );
});

test("category overview is a projection over existing Saved Problem metadata", () => {
  assert.deepEqual(
    summarizeSavedProblemCategories([
      { category: "생산성", status: "active" },
      { category: "생산성", status: "archived" },
      { category: "개발도구", status: "active" },
      { category: null, status: "active" },
    ]),
    [
      { category: "개발도구", total_count: 1, active_count: 1, archived_count: 0 },
      { category: "생산성", total_count: 2, active_count: 1, archived_count: 1 },
    ],
  );
});

test("Saved Problems page exposes category archive without a new taxonomy entity", async () => {
  const page = await read("app/problems/page.js");
  const service = await read("lib/saved-problems/service.mjs");

  assert.match(page, /카테고리별 Problem Archive/);
  assert.match(page, /loadSavedProblemCategoryOverview/);
  assert.match(page, /savedProblemLibraryHref\(\{ status: "archived", category \}\)/);
  assert.match(page, /선택: \{category\}/);
  assert.match(service, /\.eq\("category", category\)/);
  assert.match(service, /select\("category, status"\)/);
  assert.doesNotMatch(page, /category_id|categoryId/);
});

test("v0.3 research assets remain in Personal Workspace after Public Radar becomes primary", async () => {
  const home = await read("app/page.js");
  const workspacePage = await read("app/workspace/page.js");
  const workspace = await read("app/components/personal-workspace.js");
  const readme = await read("README.md");
  const phase14 = await read("docs/phase14-v03-consolidation.md");

  assert.match(home, /Problem Discovery Radar/);
  assert.match(home, /사람들이 요즘, 무엇을 불편해하고 있을까요/);
  assert.match(home, /href="\/workspace"/);
  assert.match(workspacePage, /PersonalWorkspace/);
  assert.match(workspace, /Personal Research Workspace/);
  assert.match(workspace, /<RawInputDashboard \/>/);
  assert.match(workspace, /Saved Problems/);
  assert.match(workspace, /Problem Compare/);
  assert.match(workspace, /Idea Board/);
  assert.match(workspace, /Research Projects/);

  for (const capability of [
    "Idea Board",
    "Problem Comparison",
    "기존 서비스 / 대안",
    "deterministic Markdown export",
    "카테고리별 Saved Problem archive/filter",
  ]) {
    assert.ok(readme.includes(capability), `README missing ${capability}`);
  }

  assert.match(phase14, /PHASE_14_SUCCESS \/ V0_3_CLOSED/);
  assert.match(phase14, /POST/);
  assert.match(phase14, /PATCH/);
  assert.match(phase14, /DELETE/);
});
