import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPhase15_8QCanonicalDraft,
  PHASE15_8Q_EXISTING_LODGING_TITLE,
  PHASE15_8Q_INCIDENT_KEYS,
  PHASE15_8Q_PROPOSAL,
  PHASE15_8Q_READY_REASON_CODE,
  PHASE15_8Q_VERSION,
} from "../lib/sources/approved-canonical-problem-draft.mjs";
import { PHASE15_8P_PROBLEM_SIGNATURE } from "../lib/sources/source-approved-incident-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function links() {
  return [
    { incident_key: "agoda_reservation_fulfillment_gap_case", source_signal_id: "source-agoda" },
    { incident_key: "yeogieottae_reservation_fulfillment_gap_case", source_signal_id: "source-yeogi" },
  ];
}

function problems() {
  return [
    {
      title: PHASE15_8Q_EXISTING_LODGING_TITLE,
      summary: "서로 다른 두 예약 사건에서 예외 취소·환불을 위해 숙소의 승인 또는 응답이 필요했다.",
      status: "published",
    },
    {
      title: "헬스장 환불 지연 문제",
      summary: "별도 문제",
      status: "published",
    },
  ];
}

test("15.8Q turns exactly two approved persisted Incidents into one ready non-persisted Canonical draft", () => {
  const result = buildPhase15_8QCanonicalDraft({ incidentLinks: links(), publicProblems: problems() });
  assert.equal(result.version, PHASE15_8Q_VERSION);
  assert.equal(result.draft_result.draft_state, "ready");
  assert.equal(result.draft_result.draft.problem_signature, PHASE15_8P_PROBLEM_SIGNATURE);
  assert.equal(result.draft_result.draft.source_count, 2);
  assert.equal(result.draft_result.draft.incident_count, 2);
  assert.equal(result.draft_result.draft.persistence_state, "not_persisted");
  assert.equal(result.draft_result.draft.publication_state, "not_published");
  assert.deepEqual(result.draft_result.reason_codes, [PHASE15_8Q_READY_REASON_CODE]);
});

test("15.8Q proposal describes reservation fulfillment rather than exception cancellation", () => {
  assert.equal(PHASE15_8Q_PROPOSAL.category, "travel_booking");
  assert.match(PHASE15_8Q_PROPOSAL.title, /예약 확정/);
  assert.match(PHASE15_8Q_PROPOSAL.title, /예약·이행/);
  assert.match(PHASE15_8Q_PROPOSAL.summary, /확보·반영되지 않은/);
  assert.match(PHASE15_8Q_PROPOSAL.situation, /예약 반영 또는 이용/);
  assert.doesNotMatch(PHASE15_8Q_PROPOSAL.situation, /결항|일정 변경|예외 취소/);
});

test("new booking fulfillment draft is frozen as distinct-adjacent to existing exception-refund Problem", () => {
  const result = buildPhase15_8QCanonicalDraft({ incidentLinks: links(), publicProblems: problems() });
  const relation = result.relationship_to_existing_lodging_problem;
  assert.equal(relation.relation, "distinct_adjacent_problem");
  assert.equal(relation.existing_mechanism, "exception_cancellation_refund_coordination");
  assert.equal(relation.new_problem_signature, PHASE15_8P_PROBLEM_SIGNATURE);
  assert.equal(relation.remediation_overlap_possible, true);
  assert.equal(relation.merge_authorized, false);
  assert.equal(relation.existing_problem_mutation_authorized, false);
  assert.equal(result.persistence_authorized, false);
  assert.equal(result.public_evidence_persistence_authorized, false);
  assert.equal(result.publication_authorized, false);
});

test("15.8Q fails closed on incomplete, duplicated, or drifted Incident identity", () => {
  assert.throws(
    () => buildPhase15_8QCanonicalDraft({ incidentLinks: links().slice(0, 1), publicProblems: problems() }),
    /exactly two persisted Incident→Source links/,
  );
  assert.throws(
    () => buildPhase15_8QCanonicalDraft({
      incidentLinks: links().map((item) => ({ ...item, source_signal_id: "same-source" })),
      publicProblems: problems(),
    }),
    /two distinct Sources/,
  );
  assert.throws(
    () => buildPhase15_8QCanonicalDraft({
      incidentLinks: [links()[0], { incident_key: "wrong-incident", source_signal_id: "source-b" }],
      publicProblems: problems(),
    }),
    /approved Incident identity drifted/,
  );
});

test("existing lodging Problem must still exist once and remain published", () => {
  assert.throws(
    () => buildPhase15_8QCanonicalDraft({ incidentLinks: links(), publicProblems: [] }),
    /existing published lodging exception Problem authority drifted/,
  );
  assert.throws(
    () => buildPhase15_8QCanonicalDraft({
      incidentLinks: links(),
      publicProblems: [{ title: PHASE15_8Q_EXISTING_LODGING_TITLE, summary: "x", status: "draft" }],
    }),
    /must remain published/,
  );
});

test("15.8Q repository authority does not embed raw Source UUIDs", async () => {
  const helper = await read("lib/sources/approved-canonical-problem-draft.mjs");
  const runner = await read("scripts/run-canonical-problem-draft-gate-15-8q.mjs");
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  assert.doesNotMatch(helper, uuidPattern);
  assert.doesNotMatch(runner, uuidPattern);
  assert.deepEqual([...PHASE15_8Q_INCIDENT_KEYS].sort(), [
    "agoda_reservation_fulfillment_gap_case",
    "yeogieottae_reservation_fulfillment_gap_case",
  ]);
});

test("15.8Q runner is structurally read-only", async () => {
  const script = await read("scripts/run-canonical-problem-draft-gate-15-8q.mjs");
  assert.doesNotMatch(script, /\.rpc\(/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /assertZeroMutation/);
  assert.match(script, /source_signal_ids_emitted: false/);
  assert.match(script, /canonical_problem_created: false/);
  assert.match(script, /public_evidence_created: false/);
  assert.match(script, /publication_performed: false/);
});

test("15.8Q workflow checks out authoritative main and has only temporary read-only live trigger", async () => {
  const workflow = await read(".github/workflows/source-canonical-draft-gate-15-8q.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8q-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /run-canonical-problem-draft-gate-15-8q\.mjs/);
  assert.doesNotMatch(workflow, /ALLOW_/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
});
