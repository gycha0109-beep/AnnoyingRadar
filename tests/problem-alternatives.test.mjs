import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProblemAlternativeCreate,
  normalizeProblemAlternativePatch,
  PROBLEM_ALTERNATIVE_KINDS,
} from "../lib/problem-alternatives/contracts.mjs";

test("Problem alternative create normalizes manual research fields", () => {
  assert.deepEqual(PROBLEM_ALTERNATIVE_KINDS, ["service", "alternative"]);
  assert.deepEqual(
    normalizeProblemAlternativeCreate({
      kind: "service",
      name: "  Example Service  ",
      url: " https://example.com/path ",
      note: "  Existing workaround  ",
    }),
    {
      kind: "service",
      name: "Example Service",
      url: "https://example.com/path",
      note: "Existing workaround",
    },
  );
});

test("Problem alternative create permits a manual alternative without URL", () => {
  assert.deepEqual(
    normalizeProblemAlternativeCreate({
      kind: "alternative",
      name: "Spreadsheet workaround",
      url: "",
      note: "",
    }),
    {
      kind: "alternative",
      name: "Spreadsheet workaround",
      url: null,
      note: null,
    },
  );
});

test("Problem alternative contracts reject unsupported kinds, protocols and fields", () => {
  assert.throws(
    () => normalizeProblemAlternativeCreate({ kind: "competitor", name: "X" }),
    /service or alternative/,
  );
  assert.throws(
    () => normalizeProblemAlternativeCreate({ kind: "service", name: "X", url: "javascript:alert(1)" }),
    /http\(s\) URL/,
  );
  assert.throws(
    () => normalizeProblemAlternativePatch({ rank: 1 }),
    /Unsupported Problem alternative fields/,
  );
});

test("Problem alternative patch only returns provided mutable fields", () => {
  assert.deepEqual(
    normalizeProblemAlternativePatch({ note: " revised ", url: null }),
    { note: "revised", url: null },
  );
  assert.throws(() => normalizeProblemAlternativePatch({}), /must not be empty/);
});
