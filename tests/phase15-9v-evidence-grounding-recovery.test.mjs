import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildExactFormationEvidenceCandidates,
  buildFormationEvidenceSelectionRequest,
} from "../lib/sources/source-formation-evidence-grounding-recovery.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9V evidence candidates are server-owned exact substrings", () => {
  const fullText = `${"가".repeat(120)} 문제 구간입니다. ${"나".repeat(150)} 마지막 구간입니다.`;
  const candidates = buildExactFormationEvidenceCandidates(fullText, {
    windowChars: 100,
    strideChars: 50,
    maxCandidates: 12,
  });
  assert.ok(candidates.length >= 3);
  for (const candidate of candidates) {
    assert.match(candidate.id, /^c\d{2}$/);
    assert.equal(fullText.slice(candidate.start, candidate.end), candidate.text);
    assert.equal(fullText.includes(candidate.text), true);
  }
});

test("15.9V quote selector freezes semantic enums and returns only candidate id", () => {
  const candidates = [
    { id: "c01", start: 0, end: 24, text: "정확한 원문 후보 첫 번째 문장입니다." },
    { id: "c02", start: 25, end: 50, text: "정확한 원문 후보 두 번째 문장입니다." },
  ];
  const semantic = {
    problem_claim: "yes",
    experience_actor: "self",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    source_origin: "original",
    friction_responsibility: "external_service_or_product",
  };
  const request = buildFormationEvidenceSelectionRequest({ semantic, candidates, model: "test-model" });
  const serialized = JSON.stringify(request);
  assert.match(serialized, /source-formation-evidence-selection-v0\.1/);
  assert.match(serialized, /problem_claim/);
  assert.match(serialized, /external_service_or_product/);
  assert.deepEqual(
    request.body.text.format.schema.properties.candidate_id.anyOf[0].enum,
    ["c01", "c02"],
  );
  assert.equal(request.body.text.format.schema.additionalProperties, false);
  assert.equal(Object.hasOwn(request.body.text.format.schema.properties, "evidence_quote"), false);
});

test("15.9V runner is bound to exact 15.9T outcome and exact failed 15.9U Formation", async () => {
  const script = await read("scripts/run-exact-csc-evidence-grounding-recovery-15-9v.mjs");
  assert.match(script, /b3fc24092df04938ff473f2e405e2cff2bfd6d7b698ce4df7dd093883fecef0c/);
  assert.match(script, /db6e21b5f66e4fcd387484d8b3f791ac9d17886c42945c831d0be51d8184aef4/);
  assert.match(script, /phase15\.9t-exact-csc-outcome-v0\.1/);
  assert.match(script, /phase15\.9u-exact-csc-second-formation-v0\.1/);
  assert.match(script, /source_formation_invalid_evidence_quote/);
  assert.match(script, /EXPECTED_FORMATION_TOTAL_BEFORE = 2/);
  assert.match(script, /requires exactly the single 15\.9U baseline Formation/);
  assert.match(script, /source_admission_outcome_id, outcomeId/);
  assert.doesNotMatch(script, /latest/i);
});

test("15.9V allows at most one source fetch, two model calls and one Formation write", async () => {
  const script = await read("scripts/run-exact-csc-evidence-grounding-recovery-15-9v.mjs");
  assert.match(script, /MAX_SOURCE_NETWORK_REQUESTS = 1/);
  assert.match(script, /MAX_MODEL_CALLS = 2/);
  assert.match(script, /persistSourceFormationAssessment/);
  assert.match(script, /formationAfter, formationBefore \+ 1/);
  assert.match(script, /assert\.deepEqual\(protectedAfter, protectedBefore/);
  assert.match(script, /incident_persistence_authorized: false/);
  assert.match(script, /source_incident_link_authorized: false/);
  assert.match(script, /public_problem_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.doesNotMatch(script, /ar_register_source_incident/);
  assert.doesNotMatch(script, /ar_create_canonical_public_problem_draft/);
});

test("15.9V recovery module never lets the quote-selection model author quote text", async () => {
  const recoverySource = await read("lib/sources/source-formation-evidence-grounding-recovery.mjs");
  assert.match(recoverySource, /The semantic enum fields are frozen facts/);
  assert.match(recoverySource, /Do not return or rewrite source text/);
  assert.match(recoverySource, /server will map the selected id to the exact stored excerpt/i);
  assert.match(recoverySource, /candidate_id/);
  assert.match(recoverySource, /selection\.candidate\.text/);
  assert.match(recoverySource, /fullContext\.content_text\.includes\(exactQuote\)/);
});

test("15.9V artifact excludes source and authority identifiers", async () => {
  const script = await read("scripts/run-exact-csc-evidence-grounding-recovery-15-9v.mjs");
  for (const forbidden of [
    "source_signal_id",
    "source_admission_outcome_id",
    "formation_id",
    "canonical_url",
    "author_handle",
    "raw_text",
    "content_text",
    "provider_request_id",
    "incident_id",
    "public_problem_id",
  ]) {
    assert.match(script, new RegExp(`\\"${forbidden}`));
  }
  assert.match(script, /evidence_quote\\"/);
});

test("15.9V temporary workflow waits for successful merged-main CI", async () => {
  const workflow = await read(".github/workflows/source-exact-csc-evidence-grounding-recovery-15-9v.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /ALLOW_PHASE15_9V_EVIDENCE_GROUNDING_RECOVERY: "true"/);
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});
