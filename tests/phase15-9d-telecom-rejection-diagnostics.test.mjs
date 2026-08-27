import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PHASE15_9D_EXPECTED_REJECT_COHORT,
  PHASE15_9D_PER_STRATUM,
  PHASE15_9D_REJECTION_STRATA,
  PHASE15_9D_SAMPLE_SIZE,
  selectPhase15_9DRejectSample,
  summarizePhase15_9DDiagnostics,
} from "../lib/sources/phase15-9d-rejection-diagnostics.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9D freezes a 16-record four-stratum diagnostic sample", () => {
  assert.equal(PHASE15_9D_EXPECTED_REJECT_COHORT, 313);
  assert.equal(PHASE15_9D_PER_STRATUM, 4);
  assert.equal(PHASE15_9D_SAMPLE_SIZE, 16);
  assert.deepEqual(PHASE15_9D_REJECTION_STRATA, [
    "title_no_complaint_signal",
    "snippet_information_only",
    "title_truncated_no_complaint_signal",
    "title_information_or_guide",
  ]);

  const records = PHASE15_9D_REJECTION_STRATA.flatMap((reason, reasonIndex) =>
    Array.from({ length: 6 }, (_, itemIndex) => ({
      signal: {
        id: `signal-${reasonIndex}-${itemIndex}`,
        external_content_id: `${reasonIndex}`.repeat(2) + `${itemIndex}`.repeat(62),
      },
      admission: { decision: "reject", reason_codes: [reason] },
    })),
  );
  const excludedSignalIds = new Set(["signal-0-0"]);
  const first = selectPhase15_9DRejectSample(records, { excludedSignalIds });
  const second = selectPhase15_9DRejectSample(records, { excludedSignalIds });
  assert.equal(first.length, 16);
  assert.deepEqual(first.map((item) => item.signal.id), second.map((item) => item.signal.id));
  assert.equal(first.some((item) => excludedSignalIds.has(item.signal.id)), false);
  for (const reason of PHASE15_9D_REJECTION_STRATA) {
    assert.equal(first.filter((item) => item.admission.reason_codes[0] === reason).length, 4);
  }
});

test("15.9D summary distinguishes confirmed, possible, consistent and unavailable outcomes", () => {
  const summary = summarizePhase15_9DDiagnostics([
    { fetch_status: "resolved", full_context_decision: "candidate" },
    { fetch_status: "resolved", full_context_decision: "review" },
    { fetch_status: "resolved", full_context_decision: "reject" },
    { fetch_status: "unavailable", full_context_decision: null },
  ]);
  assert.deepEqual(summary, {
    total: 4,
    fetched_resolved: 3,
    fetched_unavailable: 1,
    candidate: 1,
    review: 1,
    reject: 1,
    false_negative_confirmed: 1,
    false_negative_possible: 1,
    policy_consistent: 1,
  });
});

test("15.9D runner is blind-safe, bounded and read-only", async () => {
  const script = await read("scripts/run-telecom-rejection-diagnostics-15-9d.mjs");
  assert.match(script, /getEvaluationSampleIds/);
  assert.match(script, /selectPhase15_9DRejectSample/);
  assert.match(script, /fetchSourceFullContext/);
  assert.match(script, /judgeSourceFullContextSemantics/);
  assert.match(script, /resolveFullContextSemantic/);
  assert.match(script, /ALLOW_PHASE15_9D_REJECTION_DIAGNOSTICS/);
  assert.match(script, /database_writes: 0/);
  assert.match(script, /incident_creation_authorized: false/);
  assert.match(script, /problem_signature_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.from\([^)]*\)[\s\S]{0,500}?\.update\(/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
});

test("15.9D artifact excludes raw source bodies and direct lineage identifiers", async () => {
  const script = await read("scripts/run-telecom-rejection-diagnostics-15-9d.mjs");
  assert.match(script, /source_identity_sha256/);
  assert.match(script, /source_content_sha256/);
  assert.match(script, /full_context_hash/);
  assert.match(script, /evidence_quote_sha256/);
  for (const field of ["source_signal_id", "canonical_url", "author_handle", "raw_text", "content_text", "incident_id", "public_problem_id"]) {
    assert.match(script, new RegExp(field));
  }
});

test("15.9D workflow is one-shot and uses the existing full-context model family", async () => {
  const workflow = await read(".github/workflows/source-telecom-rejection-diagnostics-15-9d.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9d-live-execution/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /OPENAI_SOURCE_FULL_CONTEXT_MODEL: gpt-5-mini-2025-08-07/);
  assert.match(workflow, /ALLOW_PHASE15_9D_REJECTION_DIAGNOSTICS: "true"/);
  assert.match(workflow, /retention-days: 1/);
});
