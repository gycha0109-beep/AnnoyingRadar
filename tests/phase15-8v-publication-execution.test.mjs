import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PHASE15_8V_APPROVAL,
  PHASE15_8V_PROBLEM_SIGNATURE,
  PHASE15_8V_VERSION,
} from "../lib/sources/approved-publication-execution.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8V freezes the explicit curator approval without metadata or Evidence edits", () => {
  assert.equal(PHASE15_8V_VERSION, "phase15.8v-publication-execution-v0.1");
  assert.equal(PHASE15_8V_PROBLEM_SIGNATURE, "lodging_reservation_fulfillment_gap");
  assert.deepEqual(PHASE15_8V_APPROVAL, {
    publication_decision: "approve",
    decision_reason: "explicit_curator_publication_approval_without_edits",
    metadata_edits_authorized: false,
    evidence_edits_authorized: false,
    publication_authorized: true,
  });
});

test("15.8V runner performs exactly one status RPC and no direct table writes", async () => {
  const script = await read("scripts/run-publication-execution-15-8v.mjs");
  assert.match(script, /status_rpc_calls: 1/);
  assert.match(script, /ar_set_public_problem_status/);
  assert.match(script, /p_status: "published"/);
  assert.match(script, /ALLOW_PUBLIC_PROBLEM_PUBLICATION/);
  assert.match(script, /target_public_feed_after: targetFeedAfter/);
  assert.match(script, /publication_performed: true/);
  assert.match(script, /metadata_edits_performed: false/);
  assert.match(script, /evidence_edits_performed: false/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
});

test("15.8V guards exact approved copy, Evidence authority, and public projection", async () => {
  const lib = await read("lib/sources/approved-publication-execution.mjs");
  const script = await read("scripts/run-publication-execution-15-8v.mjs");
  assert.match(lib, /PHASE15_8Q_PROPOSAL\.title/);
  assert.match(lib, /PHASE15_8Q_PROPOSAL\.summary/);
  assert.match(lib, /validatePublicationEvidenceRows/);
  assert.match(lib, /problem\.status, "draft"/);
  assert.match(lib, /problem\.status, "published"/);
  assert.match(lib, /targetFeedRows, 1/);
  assert.match(script, /after\.public_feed, before\.public_feed \+ 1/);
  assert.match(script, /publishedAfter, publishedBefore \+ 1/);
  assert.match(script, /draftAfter, draftBefore - 1/);
});

test("15.8V workflow is one-shot, model-free, and checks out authoritative main", async () => {
  const workflow = await read(".github/workflows/source-publication-execution-15-8v.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8v-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PUBLIC_PROBLEM_PUBLICATION: "true"/);
  assert.match(workflow, /run-publication-execution-15-8v\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_/);
});

test("15.8V repository does not freeze raw Source, Incident, or Problem UUIDs", async () => {
  const files = await Promise.all([
    read("lib/sources/approved-publication-execution.mjs"),
    read("scripts/run-publication-execution-15-8v.mjs"),
    read(".github/workflows/source-publication-execution-15-8v.yml"),
  ]);
  for (const text of files) {
    assert.doesNotMatch(text, /0f33f4e4-dd0c-42f5-b14b-ac8d2e6fde45/);
    assert.doesNotMatch(text, /d5e70d0d-ddba-4ebd-998b-608d99338229/);
    assert.doesNotMatch(text, /6d330df2-a0c7-411c-8f98-e7e8790b3c18/);
  }
});
