import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSourceFormationAssessmentRow,
  SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION,
  SOURCE_FORMATION_ASSESSMENT_TABLE,
  validateFormationContextAgainstAdmission,
} from "../lib/sources/source-formation-assessment-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SIGNAL_ID = "11111111-1111-4111-8111-111111111111";
const OUTCOME_ID = "22222222-2222-4222-8222-222222222222";
const FULL_TEXT = "예약한 서비스가 실제로 처리되지 않아 고객센터에 여러 번 문의했고 해결까지 오래 걸렸습니다. 이후 동일 내용을 다시 확인했습니다.";
const QUOTE = "고객센터에 여러 번 문의했고 해결까지 오래 걸렸습니다.";

function admission(overrides = {}) {
  return {
    id: OUTCOME_ID,
    outcome_schema_version: "source-full-context-outcome-v0.1",
    batch_version: "test-admission-v0.1",
    source_signal_id: SIGNAL_ID,
    status: "resolved",
    decision: "candidate",
    context_status: "resolved",
    context_scope: "full_post",
    context_content_sha256: sha256(FULL_TEXT),
    context_char_count: FULL_TEXT.length,
    context_truncated: false,
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
    extraction_scope: "article_element",
    ...overrides,
  };
}

function semantic(overrides = {}) {
  return {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
    evidence_quote: QUOTE,
    problem_mechanism_proposal: "service fulfillment gap",
    incident_summary_proposal: "one service request required repeated support contact",
    prompt_version: "source-problem-formation-semantic-v0.1",
    provider: "openai",
    model: "test-model",
    provider_request_id: "must-not-persist",
    ...overrides,
  };
}

function formationResult(overrides = {}) {
  return {
    version: "source-problem-formation-observer-v0.2",
    status: "resolved",
    formation_state: "eligible",
    resolved: true,
    reason_codes: ["formation_grounded_external_friction"],
    semantic: semantic(),
    full_context: fullContext(),
    recovery: {
      version: "source-problem-formation-provider-recovery-v0.1",
      attempted: false,
      recovered: false,
      attempt_count: 1,
      trigger_reason_code: null,
    },
    ...overrides,
  };
}

test("15.9N builds an integrity-bound row without raw source or evidence quote text", () => {
  const row = buildSourceFormationAssessmentRow({
    assessmentBatchVersion: "test-formation-v0.1",
    sourceSignalId: SIGNAL_ID,
    sourceAdmissionOutcome: admission(),
    result: formationResult(),
  });

  assert.equal(SOURCE_FORMATION_ASSESSMENT_SCHEMA_VERSION, "source-formation-assessment-outcome-v0.1");
  assert.equal(SOURCE_FORMATION_ASSESSMENT_TABLE, "ar_source_formation_assessments");
  assert.equal(row.source_admission_outcome_id, OUTCOME_ID);
  assert.equal(row.context_content_sha256, sha256(FULL_TEXT));
  assert.equal(row.context_char_count, FULL_TEXT.length);
  assert.equal(row.evidence_quote_sha256, sha256(QUOTE));
  assert.equal(row.evidence_quote_char_count, QUOTE.length);
  assert.equal(FULL_TEXT.slice(row.evidence_quote_start, row.evidence_quote_end), QUOTE);
  assert.equal(row.evidence_quote_grounded, true);
  assert.equal("evidence_quote" in row, false);
  assert.equal("provider_request_id" in row, false);
  assert.equal("content_text" in row, false);
  assert.equal("canonical_url" in row, false);
});

test("15.9N can persist an unresolved provider assessment while retaining exact context authority", () => {
  const row = buildSourceFormationAssessmentRow({
    assessmentBatchVersion: "test-provider-review-v0.1",
    sourceSignalId: SIGNAL_ID,
    sourceAdmissionOutcome: admission(),
    configuredModel: "test-model",
    result: formationResult({
      status: "unresolved",
      formation_state: "review",
      resolved: false,
      reason_codes: ["source_formation_provider_incomplete"],
      semantic: null,
      configured_model: "test-model",
      recovery: {
        version: "source-problem-formation-provider-recovery-v0.1",
        attempted: true,
        recovered: false,
        attempt_count: 2,
        trigger_reason_code: "source_formation_provider_incomplete",
      },
    }),
  });

  assert.equal(row.status, "unresolved");
  assert.equal(row.formation_state, "review");
  assert.equal(row.problem_claim, null);
  assert.equal(row.evidence_quote_sha256, null);
  assert.equal(row.evidence_quote_char_count, 0);
  assert.equal(row.prompt_version, "source-problem-formation-semantic-v0.1");
  assert.equal(row.model_name, "test-model");
  assert.equal(row.recovery_attempted, true);
  assert.equal(row.recovery_attempt_count, 2);
});

test("15.9N fails closed on fetch hash mismatch, Admission drift, or truncation", () => {
  const driftedText = `${FULL_TEXT} drift`;
  assert.throws(
    () => validateFormationContextAgainstAdmission(admission(), fullContext({ content_text: driftedText })),
    /fetch content_hash does not match the exact fetched text/,
  );
  assert.throws(
    () => validateFormationContextAgainstAdmission(admission(), fullContext({
      content_text: driftedText,
      content_hash: sha256(driftedText),
      original_char_count: driftedText.length,
    })),
    /drifted from durable Source Admission authority/,
  );
  assert.throws(
    () => validateFormationContextAgainstAdmission(admission(), fullContext({ truncated: true })),
    /untruncated current context/,
  );
  assert.throws(
    () => validateFormationContextAgainstAdmission(admission({ context_truncated: true }), fullContext()),
    /untruncated Source Admission context/,
  );
});

test("migration 039 is private append-only and repeats integrity guards in PostgreSQL", async () => {
  const sql = await read("supabase/migrations/039_source_formation_assessments.sql");
  assert.match(sql, /create table public\.ar_source_formation_assessments/);
  assert.match(sql, /references public\.ar_source_full_context_resolution_outcomes\(id\)/);
  assert.match(sql, /unique \(assessment_batch_version, source_signal_id\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select, insert on table public\.ar_source_formation_assessments\s+to service_role/);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)/i);
  assert.match(sql, /ar_guard_source_formation_assessment/);
  assert.match(sql, /Blind evaluation Source Signal cannot receive Formation assessments/);
  assert.match(sql, /context does not match durable Source Admission context/);
  assert.match(sql, /downstream Incident\/Public Evidence authority/);
  assert.doesNotMatch(sql, /\bevidence_quote\s+text\b/);
  assert.match(sql, /evidence_quote_sha256/);
  assert.match(sql, /evidence_quote_start/);
  assert.match(sql, /evidence_quote_end/);
});

test("15.9N persistence service proves Blind/Candidate/batch/downstream gates before source URL/body loading", async () => {
  const service = await read("lib/sources/source-formation-persistence-service.mjs");
  const blind = service.indexOf("await requireNonBlindSource");
  const admissionGate = service.indexOf("await requireSingleDurableCandidateOutcome");
  const batchGate = service.indexOf("await requireNoExistingBatchAssessment");
  const downstreamGate = service.indexOf("await requireNoDownstreamAssignment");
  const sourceLoad = service.indexOf("await loadFormationSource");
  assert.ok(blind >= 0 && blind < sourceLoad);
  assert.ok(admissionGate >= 0 && admissionGate < sourceLoad);
  assert.ok(batchGate >= 0 && batchGate < sourceLoad);
  assert.ok(downstreamGate >= 0 && downstreamGate < sourceLoad);
  assert.match(service, /validateFormationContextAgainstAdmission\(admission, fullContext\)/);
  assert.match(service, /source_formation_context_drift/);
  assert.match(service, /persistSourceFormationAssessment/);
  assert.doesNotMatch(service, /ar_register_source_incident/);
  assert.doesNotMatch(service, /problem_signature\s*:/);
});

test("15.9N remains a controlled server-side primitive with no new runtime write endpoint", async () => {
  const workflow = await read(".github/workflows/source-formation-assessment-persistence-15-9n.yml");
  const runner = await read("scripts/run-formation-assessment-persistence-15-9n.mjs");
  const mRoute = await read("app/api/radar/admin/source-signals/[signalId]/formation/route.js");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9n-live-execution/);
  assert.match(workflow, /ref:\s*main/);
  assert.match(workflow, /retention-days:\s*1/);
  assert.match(runner, /database_write_statements:\s*1/);
  assert.match(runner, /incident_persistence_authorized:\s*false/);
  assert.match(runner, /publication_authorized:\s*false/);
  assert.match(mRoute, /assessSourceFormationForCurator/);
  assert.doesNotMatch(mRoute, /persistFormationAssessmentForCurator/);
});
