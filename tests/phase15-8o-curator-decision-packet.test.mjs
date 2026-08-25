import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertBlankCuratorDecisionTemplate,
  buildBlankCuratorDecisionTemplate,
  fingerprintSourceSignalIds,
  hashSourceSignalId,
  PHASE15_8O_CANDIDATE_FINGERPRINT,
  PHASE15_8O_PACKET_VERSION,
  PHASE15_8O_PROPOSED_COMPARISONS,
  PHASE15_8O_SOURCE_BATCH_VERSION,
} from "../lib/sources/source-incident-curator-packet.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8O constants freeze upstream authority without embedding Source UUIDs", async () => {
  assert.equal(PHASE15_8O_PACKET_VERSION, "phase15.8o-incident-mechanism-curator-packet-v0.1");
  assert.equal(PHASE15_8O_SOURCE_BATCH_VERSION, "phase15.8m-b-remainder-v0.1");
  assert.equal(PHASE15_8O_CANDIDATE_FINGERPRINT, "aa33d9da6ca6940406fcc3f9faec6bb6a390f40741ce580897fb36f94a48b020");
  assert.equal(PHASE15_8O_PROPOSED_COMPARISONS.length, 2);

  const helper = await read("lib/sources/source-incident-curator-packet.mjs");
  assert.doesNotMatch(helper, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(helper, /strong_candidate: 3/);
  assert.match(helper, /blocked_review: 2/);
  assert.match(helper, /curator_reread_required: 2/);
  assert.match(helper, /reject: 1/);
});

test("source identity hashing and cohort fingerprinting are deterministic", () => {
  assert.equal(hashSourceSignalId("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(fingerprintSourceSignalIds(["b", "a"]), fingerprintSourceSignalIds(["a", "b"]));
});

test("curator decision template starts blank and cannot imply persistence", () => {
  const planned = [
    { sourceSignalId: "source-a", disposition: "strong_candidate", comparison_proposal_key: "lodging_reservation_fulfillment" },
    { sourceSignalId: "source-b", disposition: "curator_reread_required", comparison_proposal_key: null },
    { sourceSignalId: "source-c", disposition: "blocked_review", comparison_proposal_key: null },
  ];
  const template = assertBlankCuratorDecisionTemplate(buildBlankCuratorDecisionTemplate(planned));
  assert.equal(template.persistence_authorized, false);
  assert.equal(template.source_decisions.length, 2);
  assert.equal(template.comparison_decisions.length, 1);
  assert.ok(template.source_decisions.every((item) => item.evidence_decision === null && item.incident_action === null));
  assert.ok(template.comparison_decisions.every((item) => item.same_problem_mechanism === null && item.problem_signature === null));
});

test("15.8O runner remains read-only and bounds full-context reread to five Sources", async () => {
  const script = await read("scripts/run-incident-mechanism-curator-packet-15-8o.mjs");
  assert.match(script, /EXPECTED_BATCH_ROWS = 82/);
  assert.match(script, /EXPECTED_CANDIDATES = 8/);
  assert.match(script, /EXPECTED_REJECTS = 66/);
  assert.match(script, /EXPECTED_UNRESOLVED_REVIEWS = 8/);
  assert.match(script, /actionable\.length, 5/);
  assert.match(script, /paid_external_model_calls: 0/);
  assert.match(script, /candidateIncidentLinks\.length, 0/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.rpc\(/);
});

test("15.8O artifact deliberately contains reread context but no completed curator decision", async () => {
  const script = await read("scripts/run-incident-mechanism-curator-packet-15-8o.mjs");
  assert.match(script, /content_text: fullContext\.content_text/);
  assert.match(script, /authority: "curator_decision_packet_not_a_decision"/);
  assert.match(script, /curator_decisions_completed: 0/);
  assert.match(script, /database_writes: 0/);
});

test("15.8O closeout workflow is one-day, no-model, authoritative-main, and manual-only", async () => {
  const workflow = await read(".github/workflows/source-incident-curator-packet-15-8o.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /agent\/phase15-8o-live-execution/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /run-incident-mechanism-curator-packet-15-8o\.mjs --live/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /ALLOW_PAID/);
});
