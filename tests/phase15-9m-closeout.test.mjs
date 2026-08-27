import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9M closeout freezes implementation, correction, and authoritative live lineage", async () => {
  const docs = await read("docs/phase15-9m-curator-formation-handoff.md");

  for (const authority of [
    "PR #147",
    "b8bcafc98cd7491370fbe8103f1acfcfdd1ab200",
    "CI #494 = SUCCESS",
    "PIE #131 = SUCCESS",
    "c59170695f23b8a63402ab6ef2501e097f25722a",
    "merged-main CI #495 = SUCCESS",
    "run #1 = 33051545076",
    "full_context_origin_unsupported",
    "PR #148",
    "d6fad8505c748d66935b9ada75a64b60b4261b83",
    "CI #496 = SUCCESS",
    "PIE #132 = SUCCESS",
    "e79ec9301181f9f90ce569c3258885f629f12cf1",
    "merged-main CI #497 = SUCCESS",
    "run #2 = 33052026373",
    "artifact id = 9638028885",
    "sha256:d19be51dd9159001c02c1aef5425a69e3154134d4469965841d901057f90a4a1",
  ]) {
    assert.match(docs, new RegExp(authority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(docs, /diagnostic evidence only/);
});

test("15.9M authoritative live result proves external acquisition, bounded recovery, and Review without persistence", async () => {
  const docs = await read("docs/phase15-9m-curator-formation-handoff.md");
  for (const authority of [
    "source network requests = 1 / max 8",
    "model calls = 2 / max 2",
    "database writes = 0",
    "4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463",
    "original char count = 3407",
    "attempt 1 = 1200 tokens → provider incomplete",
    "attempt 2 = 2400 tokens → recovered",
    "trigger = source_formation_provider_incomplete",
    "state = review",
    "reason = formation_semantic_uncertain",
  ]) {
    assert.match(docs, new RegExp(authority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(docs, /A Review result is a valid runtime handoff result/);
  assert.match(docs, /it does not require an Eligible outcome/);
});

test("15.9M closeout freezes independent zero-mutation production counts", async () => {
  const docs = await read("docs/phase15-9m-curator-formation-handoff.md");
  for (const row of [
    "ar_source_signals = 3562",
    "ar_source_signal_observations = 3892",
    "ar_source_ingestion_runs = 144",
    "ar_raw_inputs = 10",
    "ar_pain_evidences = 27",
    "ar_public_problems = 3",
    "ar_public_problem_evidence_snapshots = 7",
    "ar_public_problem_feed = 3",
    "ar_source_incidents = 6",
    "ar_source_incident_links = 7",
    "ar_source_full_context_resolution_outcomes = 85",
  ]) {
    assert.match(docs, new RegExp(row.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(docs, /Protected domains were unchanged\. Database writes = 0\./);
});

test("15.9M closes manual-only and does not convert Formation observation into downstream authority", async () => {
  const [workflow, service, docs] = await Promise.all([
    read(".github/workflows/source-curator-formation-handoff-15-9m.yml"),
    read("lib/sources/source-formation-service.mjs"),
    read("docs/phase15-9m-curator-formation-handoff.md"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.doesNotMatch(workflow, /agent\/phase15-9m-live-execution/);
  assert.match(service, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(service, /curator_read_only_formation_assessment_not_persistence/);
  assert.match(service, /incident_identity_assigned:\s*false/);
  assert.match(service, /public_evidence_created:\s*false/);
  assert.match(service, /publication_mutated:\s*false/);
  assert.match(docs, /A curator-visible `eligible` result, if one occurs in a future manual assessment, is still not an Incident or publication decision\./);
});
