import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getProblemComparisonSelectionState,
  MAX_PROBLEM_COMPARISON_ITEMS,
  MIN_PROBLEM_COMPARISON_ITEMS,
  normalizeProblemComparisonIds,
} from "../lib/saved-problems/comparison.mjs";

test("Problem comparison selection normalizes duplicate query ids while preserving order", () => {
  assert.deepEqual(
    normalizeProblemComparisonIds([" a ", "b", "a", "", null, "c"]),
    ["a", "b", "c"],
  );
});

test("Problem comparison requires between two and four unique confirmed Problem Cards", () => {
  assert.equal(MIN_PROBLEM_COMPARISON_ITEMS, 2);
  assert.equal(MAX_PROBLEM_COMPARISON_ITEMS, 4);
  assert.equal(getProblemComparisonSelectionState("a").valid, false);
  assert.equal(getProblemComparisonSelectionState(["a", "b"]).valid, true);
  assert.equal(getProblemComparisonSelectionState(["a", "b", "c", "d"]).valid, true);
  assert.equal(getProblemComparisonSelectionState(["a", "b", "c", "d", "e"]).valid, false);
});

test("Comparison catalog uses owned confirmed Problem Cards and comparison stays read-only", async () => {
  const librarySource = await readFile(new URL("../app/problems/page.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/problems/compare/page.js", import.meta.url), "utf8");
  const serviceSource = await readFile(new URL("../lib/saved-problems/service.mjs", import.meta.url), "utf8");

  assert.match(librarySource, /href="\/problems\/compare"/);
  assert.match(pageSource, /action="\/problems\/compare"/);
  assert.match(pageSource, /name="ids"/);
  assert.match(pageSource, /loadProblemComparisonCatalog/);
  assert.match(pageSource, /loadProblemComparison/);
  assert.match(pageSource, /종합 점수나 자동 순위를 만들지 않고/);
  assert.match(pageSource, /read-only projection/);
  assert.match(pageSource, /Saved 여부는 비교 자격과 무관/);

  const comparisonFunction = serviceSource.slice(serviceSource.indexOf("export async function loadProblemComparisonCatalog"));
  assert.match(comparisonFunction, /\.eq\("user_id", userId\)/);
  assert.match(comparisonFunction, /\.eq\("status", "confirmed"\)/);
  assert.doesNotMatch(comparisonFunction, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
