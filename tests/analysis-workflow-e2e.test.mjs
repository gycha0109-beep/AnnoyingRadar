import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYSIS_STATUSES,
  ANALYSIS_TRANSITIONS,
  analysisStatusPresentation,
  assertAnalysisTransition,
  canTransitionAnalysisStatus,
  isTerminalAnalysisStatus,
  nextAnalysisStatuses,
} from "../lib/workflow/analysis-workflow.mjs";

function runPath(path) {
  let current = path[0];
  for (const next of path.slice(1)) current = assertAnalysisTransition(current, next);
  return current;
}

test("happy path reaches a terminal completed analysis", () => {
  const finalStatus = runPath([
    "input_saved",
    "extracting",
    "reviewing_evidence",
    "grouping",
    "reviewing_candidates",
    "completed",
  ]);

  assert.equal(finalStatus, "completed");
  assert.equal(isTerminalAnalysisStatus(finalStatus), true);
  assert.deepEqual(nextAnalysisStatuses(finalStatus), []);
  assert.deepEqual(analysisStatusPresentation(finalStatus), {
    label: "분석 완료",
    stage: "completed",
    terminal: true,
  });
});

test("provider failure paths recover without skipping review boundaries", () => {
  assert.equal(
    runPath([
      "input_saved",
      "extracting",
      "extraction_failed",
      "extracting",
      "reviewing_evidence",
      "grouping",
      "grouping_failed",
      "grouping",
      "reviewing_candidates",
      "completed",
    ]),
    "completed",
  );
});

test("raw text replacement resets only explicitly eligible unfinished states", () => {
  for (const status of [
    "extraction_failed",
    "reviewing_evidence",
    "grouping_failed",
    "reviewing_candidates",
  ]) {
    assert.equal(canTransitionAnalysisStatus(status, "input_saved"), true, status);
  }

  for (const status of ["extracting", "grouping", "completed"]) {
    assert.equal(canTransitionAnalysisStatus(status, "input_saved"), false, status);
  }
});

test("fixture and forced extraction compatibility paths remain explicit", () => {
  assert.equal(canTransitionAnalysisStatus("input_saved", "reviewing_evidence"), true);
  assert.equal(canTransitionAnalysisStatus("extraction_failed", "reviewing_evidence"), true);
  assert.equal(canTransitionAnalysisStatus("reviewing_evidence", "extracting"), true);
  assert.equal(canTransitionAnalysisStatus("extracting", "extracting"), true);
  assert.equal(canTransitionAnalysisStatus("grouping", "grouping"), true);
});

test("unsupported jumps and unknown states are rejected", () => {
  const invalid = [
    ["input_saved", "grouping"],
    ["reviewing_evidence", "completed"],
    ["grouping_failed", "reviewing_candidates"],
    ["completed", "reviewing_candidates"],
    ["completed", "input_saved"],
    ["unknown", "input_saved"],
  ];

  for (const [from, to] of invalid) {
    assert.equal(canTransitionAnalysisStatus(from, to), false, `${from} -> ${to}`);
    assert.throws(() => assertAnalysisTransition(from, to), /Invalid analysis status transition/);
  }
});

test("every declared status has presentation and transition definitions", () => {
  assert.equal(new Set(ANALYSIS_STATUSES).size, ANALYSIS_STATUSES.length);
  for (const status of ANALYSIS_STATUSES) {
    assert.ok(Array.isArray(ANALYSIS_TRANSITIONS[status]), status);
    assert.notEqual(analysisStatusPresentation(status).stage, "unknown", status);
  }
});
