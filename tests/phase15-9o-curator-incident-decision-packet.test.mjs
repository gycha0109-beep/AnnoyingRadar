import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildBlankCuratorIncidentDecisionTemplate,
  SOURCE_INCIDENT_DECISION_PACKET_VERSION,
  validateDecisionPacketContext,
} from "../lib/sources/source-incident-decision-packet-service.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const FULL_TEXT = "예약은 완료되었지만 실제 처리 과정에서 누락되어 고객센터에 재확인을 요청했습니다. 해결까지 여러 차례 문의가 필요했습니다.";
const QUOTE = "고객센터에 재확인을 요청했습니다.";
const START = FULL_TEXT.indexOf(QUOTE);
const END = START + QUOTE.length;

function assessment(overrides = {}) {
  return {
    context_content_sha256: sha256(FULL_TEXT),
    context_char_count: FULL_TEXT.length,
    evidence_quote_sha256: sha256(QUOTE),
    evidence_quote_char_count: QUOTE.length,
    evidence_quote_start: START,
    evidence_quote_end: END,
    ...overrides,
  };
}

function fullContext(overrides = {}) {
  return {
    status: "resolved",
    content_scope: "full_post",
    content_text: FULL_TEXT,
    content_hash: sha256(FULL_TEXT),
    original_char_count: FULL_TEXT.length,
    truncated: false,
    ...overrides,
  };
}

test("15.9O reconstructs the exact grounded quote from durable UTF-16 offsets", () => {
  const exact = validateDecisionPacketContext(assessment(), fullContext());
  assert.equal(exact.content_text, FULL_TEXT);
  assert.equal(exact.evidence_quote, QUOTE);
});

test("15.9O fails closed on fetched hash drift, durable context drift, and quote drift", () => {
  const drifted = `${FULL_TEXT} drift`;
  assert.throws(
    () => validateDecisionPacketContext(assessment(), fullContext({ content_text: drifted })),
    /declared content hash/,
  );
  assert.throws(
    () => validateDecisionPacketContext(assessment(), fullContext({
      content_text: drifted,
      content_hash: sha256(drifted),
      original_char_count: drifted.length,
    })),
    /drifted from the explicit durable Formation assessment/,
  );
  assert.throws(
    () => validateDecisionPacketContext(assessment({ evidence_quote_sha256: sha256("different") }), fullContext()),
    /Reconstructed evidence quote does not match/,
  );
});

test("15.9O blank decision template carries no implicit curator authority", () => {
  assert.equal(SOURCE_INCIDENT_DECISION_PACKET_VERSION, "source-incident-decision-packet-v0.1");
  const template = buildBlankCuratorIncidentDecisionTemplate({
    signalId: "11111111-1111-4111-8111-111111111111",
    assessmentId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(template.authority, "blank_curator_incident_decision_template_not_a_decision");
  for (const key of [
    "evidence_decision",
    "incident_action",
    "existing_incident_id",
    "new_incident_key",
    "new_incident_label",
    "notes",
  ]) {
    assert.equal(template[key], null);
  }
  assert.equal(template.persistence_authorized, false);
});

test("15.9O service requires an explicit durable eligible assessment before loading source URL/body", async () => {
  const service = await read("lib/sources/source-incident-decision-packet-service.mjs");
  const sourceIdentity = service.indexOf("await requireSourceIdentity");
  const blind = service.indexOf("await requireNonBlindSource");
  const explicitAssessment = service.indexOf("await requireExplicitFormationAssessment");
  const downstream = service.indexOf("await requireNoDownstreamAssignment");
  const sourceLoad = service.indexOf("await loadDecisionSource");
  assert.ok(sourceIdentity >= 0 && sourceIdentity < sourceLoad);
  assert.ok(blind >= 0 && blind < sourceLoad);
  assert.ok(explicitAssessment >= 0 && explicitAssessment < sourceLoad);
  assert.ok(downstream >= 0 && downstream < sourceLoad);
  assert.match(service, /\.eq\("id", assessmentId\)/);
  assert.match(service, /\.eq\("source_signal_id", signalId\)/);
  assert.match(service, /formation_state !== "eligible"/);
  assert.match(service, /latest-row inference is not allowed/);
  assert.doesNotMatch(service, /\.order\("created_at"/);
});

test("15.9O uses bounded public context only after authority gates and performs no model judgment", async () => {
  const service = await read("lib/sources/source-incident-decision-packet-service.mjs");
  assert.match(service, /fetchSourceFullContext/);
  assert.match(service, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(service, /externalWebPolicy:\s*SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(service, /validateDecisionPacketContext/);
  assert.match(service, /loadExistingIncidentAuthority/);
  assert.match(service, /loadExistingProblemAuthority/);
  assert.doesNotMatch(service, /resolveSourceProblemFormationAudit/);
  assert.doesNotMatch(service, /OPENAI_API_KEY/);
});

test("15.9O route is curator-only GET and requires formationAssessmentId", async () => {
  const route = await read("app/api/radar/admin/source-signals/[signalId]/incident-decision-packet/route.js");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(route, /requireRadarCurator/);
  assert.match(route, /searchParams\.get\("formationAssessmentId"\)/);
  assert.match(route, /buildCuratorIncidentDecisionPacket/);
});

test("15.9O route, service, and runner are database-mutation free", async () => {
  const files = await Promise.all([
    read("app/api/radar/admin/source-signals/[signalId]/incident-decision-packet/route.js"),
    read("lib/sources/source-incident-decision-packet-service.mjs"),
    read("scripts/run-curator-incident-decision-packet-15-9o.mjs"),
  ]);
  for (const source of files) {
    for (const pattern of [/\.insert\s*\(/, /\.upsert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.rpc\s*\(/]) {
      assert.doesNotMatch(source, pattern);
    }
  }
});

test("15.9O one-shot workflow is no-model, authoritative-main, and disposable", async () => {
  const workflow = await read(".github/workflows/source-curator-incident-decision-packet-15-9o.yml");
  const runner = await read("scripts/run-curator-incident-decision-packet-15-9o.mjs");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9o-live-execution/);
  assert.match(workflow, /ref:\s*main/);
  assert.match(workflow, /ALLOW_PHASE15_9O_CURATOR_INCIDENT_DECISION_PACKET:\s*"true"/);
  assert.match(workflow, /retention-days:\s*1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.match(runner, /TARGET_ASSESSMENT_BATCH = "phase15\.9n-ordinal9-persistence-v0\.1"/);
  assert.match(runner, /model_calls:\s*0/);
  assert.match(runner, /database_write_statements:\s*0/);
  assert.match(runner, /source_signal_id_emitted:\s*false/);
  assert.match(runner, /raw_evidence_quote_emitted:\s*false/);
});
