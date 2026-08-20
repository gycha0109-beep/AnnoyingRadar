import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Naver live verification cannot PASS on an empty acquisition", async () => {
  const script = await read("scripts/run-naver-live-verification.mjs");
  assert.match(script, /totalUsableSignals === 0/);
  assert.match(script, /BLOCKED_NO_LIVE_SIGNALS/);
  assert.match(script, /zero_signal_pass_forbidden: true/);
});

test("Naver live verification preserves private and public domain boundaries", async () => {
  const script = await read("scripts/run-naver-live-verification.mjs");
  assert.match(script, /ar_raw_inputs/);
  assert.match(script, /ar_pain_evidences/);
  assert.match(script, /ar_public_problems/);
  assert.match(script, /must not mutate ar_raw_inputs/);
  assert.match(script, /must not mutate ar_pain_evidences/);
  assert.match(script, /must not mutate ar_public_problems/);
});
