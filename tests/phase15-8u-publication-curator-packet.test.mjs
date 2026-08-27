import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertBlankPublicationDecisionTemplate,
  buildBlankPublicationDecisionTemplate,
  PHASE15_8U_EXPECTED_INCIDENT_KEYS,
  PHASE15_8U_PROBLEM_SIGNATURE,
  PHASE15_8U_VERSION,
} from "../lib/sources/publication-curator-packet.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8U freezes the exact publication candidate identity and Incident set", () => {
  assert.equal(PHASE15_8U_VERSION, "phase15.8u-publication-curator-decision-packet-v0.1");
  assert.equal(PHASE15_8U_PROBLEM_SIGNATURE, "lodging_reservation_fulfillment_gap");
  assert.deepEqual(PHASE15_8U_EXPECTED_INCIDENT_KEYS, [
    "agoda_reservation_fulfillment_gap_case",
    "yeogieottae_reservation_fulfillment_gap_case",
  ]);
});

test("15.8U decision template is blank and cannot imply publication authority", () => {
  const decision = buildBlankPublicationDecisionTemplate();
  assertBlankPublicationDecisionTemplate(decision);
  assert.deepEqual(decision, {
    publication_decision: null,
    decision_reason: null,
    metadata_edits_authorized: false,
    evidence_edits_authorized: false,
    publication_authorized: false,
  });
});

test("15.8U runner is strictly read-only and cannot transition or publish", async () => {
  const script = await read("scripts/run-publication-curator-packet-15-8u.mjs");
  assert.match(script, /ar_assert_public_problem_publishable/);
  assert.match(script, /database_mutations: 0/);
  assert.match(script, /public_feed_exposure: 0/);
  assert.match(script, /publication_authorized: packet\.decision\.publication_authorized/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
});

test("15.8U packet builder enforces zero mutation and blank publication decision", async () => {
  const lib = await read("lib/sources/publication-curator-packet.mjs");
  assert.match(lib, /publication_curator_decision_packet_not_a_decision/);
  assert.match(lib, /assert\.deepEqual\(databaseAfter, databaseBefore/);
  assert.match(lib, /publication_authorized: false/);
  assert.match(lib, /publication_decision: null/);
  assert.doesNotMatch(lib, /ar_set_public_problem_status/);
});

test("15.8U workflow has no model dependency and only one temporary live trigger", async () => {
  const workflow = await read(".github/workflows/source-publication-curator-packet-15-8u.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8u-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-publication-curator-packet-15-8u\.mjs/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_/);
});

test("15.8U repository does not freeze raw target Source UUIDs", async () => {
  const files = await Promise.all([
    read("lib/sources/publication-curator-packet.mjs"),
    read("scripts/run-publication-curator-packet-15-8u.mjs"),
    read(".github/workflows/source-publication-curator-packet-15-8u.yml"),
  ]);
  for (const text of files) {
    assert.doesNotMatch(text, /0f33f4e4-dd0c-42f5-b14b-ac8d2e6fde45/);
    assert.doesNotMatch(text, /d5e70d0d-ddba-4ebd-998b-608d99338229/);
  }
});
