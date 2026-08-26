import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_8PApprovedPersistencePlan,
  PHASE15_8P_APPROVAL_VERSION,
  PHASE15_8P_PROBLEM_SIGNATURE,
} from "../lib/sources/source-approved-incident-persistence.mjs";
import { buildIncidentAwareProblemClusters } from "../lib/sources/source-problem-formation.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const approvedA = "00000000-0000-4000-8000-000000000001";
const approvedB = "00000000-0000-4000-8000-000000000002";

function fakeCandidateRows() {
  return Array.from({ length: 8 }, (_, index) => ({ source_signal_id: `source-${index}` }));
}

test("15.8P approval authority stores hashes, not Source UUIDs", async () => {
  assert.equal(PHASE15_8P_APPROVAL_VERSION, "phase15.8p-approved-incident-persistence-v0.1");
  assert.equal(PHASE15_8P_PROBLEM_SIGNATURE, "lodging_reservation_fulfillment_gap");
  const helper = await read("lib/sources/source-approved-incident-persistence.mjs");
  assert.doesNotMatch(helper, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.match(helper, /20a1d6b12b080de327f321cc7a65263a414bb079a165eb2630625eb1747dbd28/);
  assert.match(helper, /10dcb81e724cc1844b37b698ff72533d17305c2f1a8f79240a14782333f8a4ae/);
  assert.doesNotMatch(helper, /71130407a9e9a330bd4cee03d51acb88f2f3e6bbdb53825588126b4995594c3c/);
  assert.match(helper, /mobile_singleton_persistence_authorized: false/);
});

test("approved Incident keys are new identities, not existing exception cases", async () => {
  const helper = await read("lib/sources/source-approved-incident-persistence.mjs");
  assert.match(helper, /yeogieottae_reservation_fulfillment_gap_case/);
  assert.match(helper, /agoda_reservation_fulfillment_gap_case/);
  assert.doesNotMatch(helper, /incident_key: "yeogieottae_exception_case"/);
  assert.doesNotMatch(helper, /incident_key: "agoda_exception_case"/);
  assert.match(helper, /same_problem_mechanism: true/);
  assert.match(helper, /canonical_problem_persistence_authorized: false/);
  assert.match(helper, /public_evidence_persistence_authorized: false/);
  assert.match(helper, /publication_authorized: false/);
});

test("approved mechanism forms one two-incident repeat-eligible cluster", () => {
  const cluster = buildIncidentAwareProblemClusters([
    {
      formation_state: "eligible",
      source_signal_id: approvedA,
      incident_key: "yeogieottae_reservation_fulfillment_gap_case",
      problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
    },
    {
      formation_state: "eligible",
      source_signal_id: approvedB,
      incident_key: "agoda_reservation_fulfillment_gap_case",
      problem_signature: PHASE15_8P_PROBLEM_SIGNATURE,
    },
  ]);
  assert.equal(cluster.length, 1);
  assert.equal(cluster[0].source_count, 2);
  assert.equal(cluster[0].incident_count, 2);
  assert.equal(cluster[0].repeat_eligible, true);
});

test("batch registration migration is service-role-only and atomic at one RPC boundary", async () => {
  const migration = await read("supabase/migrations/035_atomic_source_incident_batch_registration.sql");
  assert.match(migration, /create or replace function public\.ar_register_source_incident_batch/);
  assert.match(migration, /perform public\.ar_require_radar_curator/);
  assert.match(migration, /public\.ar_register_source_incident\(/);
  assert.match(migration, /v_seen_source_ids && v_source_ids/);
  assert.match(migration, /revoke all on function public\.ar_register_source_incident_batch\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.ar_register_source_incident_batch\(uuid, jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /exception\s+when/i);
});

test("15.8P live runner writes only through the approved atomic Incident RPC", async () => {
  const script = await read("scripts/run-approved-incident-persistence-15-8p.mjs");
  assert.match(script, /EXPECTED_BATCH_ROWS = 82/);
  assert.match(script, /EXPECTED_CANDIDATES = 8/);
  assert.match(script, /PHASE15_8P_CANDIDATE_FINGERPRINT/);
  assert.match(script, /ALLOW_APPROVED_INCIDENT_PERSISTENCE/);
  assert.equal((script.match(/\.rpc\(/g) ?? []).length, 1);
  assert.match(script, /"ar_register_source_incident_batch"/);
  assert.doesNotMatch(script, /ar_add_incident_bound_public_problem_evidence/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /after\.source_incidents, before\.source_incidents \+ 2/);
  assert.match(script, /after\.source_incident_links, before\.source_incident_links \+ 2/);
  assert.match(script, /repeat_eligible, true/);
});

test("15.8P workflow is authoritative-main, explicitly gated, and temporarily one-shot triggerable", async () => {
  const workflow = await read(".github/workflows/source-approved-incident-persistence-15-8p.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8p-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_APPROVED_INCIDENT_PERSISTENCE: "true"/);
  assert.match(workflow, /run-approved-incident-persistence-15-8p\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
});

test("helper refuses to infer approval from arbitrary Candidate rows", () => {
  assert.throws(() => buildPhase15_8PApprovedPersistencePlan(fakeCandidateRows()), /exactly two lodging Sources/);
});
