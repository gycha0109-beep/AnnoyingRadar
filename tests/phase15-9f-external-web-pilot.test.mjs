import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PHASE15_9F_SAMPLE_SIZE,
  PHASE15_9F_VERSION,
  selectPhase15_9FExternalPilot,
  summarizePhase15_9F,
} from "../lib/sources/phase15-9f-external-web-pilot.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function record(reason, id, kind = "external_web") {
  return {
    signal: { id, external_content_id: id },
    admission: { decision: "reject", reason_codes: [reason] },
    origin: { kind },
  };
}

test("15.9F sample is deterministic, external-only, and four per rejection stratum", () => {
  const reasons = [
    "title_no_complaint_signal",
    "snippet_information_only",
    "title_truncated_no_complaint_signal",
    "title_information_or_guide",
  ];
  const records = reasons.flatMap((reason, reasonIndex) => [
    ...Array.from({ length: 8 }, (_, index) => record(reason, `${reasonIndex}-${index}`)),
    record(reason, `${reasonIndex}-naver`, "naver_blog"),
  ]);
  const first = selectPhase15_9FExternalPilot(records);
  const second = selectPhase15_9FExternalPilot([...records].reverse());
  assert.equal(PHASE15_9F_VERSION, "phase15.9f-external-web-full-context-v0.1");
  assert.equal(first.length, PHASE15_9F_SAMPLE_SIZE);
  assert.deepEqual(first.map((item) => item.signal.id), second.map((item) => item.signal.id));
  assert.equal(first.every((item) => item.origin.kind === "external_web"), true);
  for (const reason of reasons) {
    assert.equal(first.filter((item) => item.admission.reason_codes[0] === reason).length, 4);
  }
});

test("15.9F summary separates acquisition failures from resolved extraction", () => {
  assert.deepEqual(summarizePhase15_9F([
    { fetch_status: "resolved", truncated: false, extraction_scope: "article_element", error_code: null },
    { fetch_status: "unavailable", truncated: false, extraction_scope: null, error_code: "full_context_fetch_http_error" },
  ]), {
    total: 2,
    resolved: 1,
    unavailable: 1,
    truncated: 0,
    extraction_scopes: { article_element: 1 },
    error_codes: { full_context_fetch_http_error: 1 },
  });
});

test("15.9F runner is read-only, blind-gated before URL load, and model-free", async () => {
  const runner = await read("scripts/run-external-web-full-context-pilot-15-9f.mjs");
  assert.match(runner, /getEvaluationSampleIds/);
  assert.match(runner, /blind_overlap_before_url_read/);
  assert.ok(
    runner.indexOf("assert.equal(blindOverlap, 0")
      < runner.indexOf("const urlFieldsById = await loadUrlFields(client"),
  );
  assert.match(runner, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(runner, /database_writes: 0/);
  assert.match(runner, /external_model_calls: 0/);
  assert.doesNotMatch(runner, /judgeSourceFullContextSemantics|resolveFullContextSemantic|getSourceFullContextProviderConfig/);
  assert.doesNotMatch(runner, /\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(runner, /\.from\([^)]*\)[\s\S]{0,500}?\.update\(/);
  assert.doesNotMatch(runner, /\.rpc\(/);
  assert.doesNotMatch(runner, /ar_register_source_incident|ar_set_public_problem_status/);
});

test("15.9F workflow is one-shot plus manual and carries no model credential", async () => {
  const workflow = await read(".github/workflows/source-external-web-full-context-pilot-15-9f.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-9f-live-execution/);
  assert.match(workflow, /ALLOW_PHASE15_9F_EXTERNAL_WEB_FULL_CONTEXT/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|GOOGLE_API_KEY|ANTHROPIC_API_KEY/);
});
