import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("../scripts/run-threads-live-verification.mjs", import.meta.url));

test("Threads live verification harness is syntax-valid and covers the acquisition matrix", () => {
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });

  const source = readFileSync(scriptPath, "utf8");
  for (const scenario of [
    "complaint_recent",
    "neutral_recent",
    "noise_top",
    "top_compare",
    "tag_recent",
    "window_recent",
    "limit_one",
    "complaint_recent_repeat",
  ]) {
    assert.match(source, new RegExp(scenario));
  }

  for (const boundary of ["ar_raw_inputs", "ar_pain_evidences", "ar_public_problems"]) {
    assert.match(source, new RegExp(boundary));
  }

  assert.match(source, /threads_not_configured/);
  assert.doesNotMatch(source, /console\.(log|error)\([^\n]*THREADS_ACCESS_TOKEN/);
});
