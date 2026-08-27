import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9L closeout freezes exact implementation and live authority", async () => {
  const doc = await read("docs/phase15-9l-formation-recovery-promotion.md");
  for (const expected of [
    "PR #145",
    "4b5e6ce5067bdd2612e76ae84bff57df25f88de8",
    "CI #489: SUCCESS",
    "PIE #128: SUCCESS",
    "a20d2d0abc5eec31966d3e1f35c87e9b666cf91b",
    "merged-main CI #490: SUCCESS",
    "33049313973",
    "9636946230",
    "sha256:95268f584029671988a75b23e7c6a869b9b78dfc4471b685d06f9e234b1279bb",
    "production_formation_recovery_policy_shadow_verified",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("15.9L closeout freezes the two real max-output recoveries", async () => {
  const doc = await read("docs/phase15-9l-formation-recovery-promotion.md");
  assert.match(doc, /provider recovery attempted = 2/);
  assert.match(doc, /provider recovery recovered = 2/);
  assert.match(doc, /provider recovery exhausted = 0/);
  assert.match(doc, /max_output_tokens = 2/);
  assert.match(doc, /Ordinal 9[\s\S]*provider status = incomplete[\s\S]*incomplete reason = max_output_tokens[\s\S]*provider status = completed/);
  assert.match(doc, /Ordinal 16[\s\S]*provider status = incomplete[\s\S]*incomplete reason = max_output_tokens[\s\S]*provider status = completed/);
  assert.match(doc, /reject[\s\S]*reason = formation_incidental_friction/);
  assert.match(doc, /reject[\s\S]*reason = formation_non_evidence_content/);
});

test("15.9L closeout freezes independent DB readback and zero-write boundary", async () => {
  const doc = await read("docs/phase15-9l-formation-recovery-promotion.md");
  for (const expected of [
    "ar_source_signals                         3562",
    "ar_source_signal_observations             3892",
    "ar_source_ingestion_runs                   144",
    "ar_raw_inputs                               10",
    "ar_pain_evidences                           27",
    "ar_public_problems                           3",
    "ar_public_problem_evidence_snapshots         7",
    "ar_public_problem_feed                       3",
    "ar_source_incidents                          6",
    "ar_source_incident_links                     7",
    "ar_source_full_context_resolution_outcomes  85",
    "DB mutations = 0",
  ]) {
    assert.ok(doc.includes(expected), `missing frozen closeout authority: ${expected}`);
  }
});

test("15.9L closeout does not grant downstream activation", async () => {
  const doc = await read("docs/phase15-9l-formation-recovery-promotion.md");
  assert.match(doc, /Incident identity or persistence/);
  assert.match(doc, /Source→Incident links/);
  assert.match(doc, /problem_signature assignment/);
  assert.match(doc, /Public Evidence creation/);
  assert.match(doc, /Canonical Problem creation/);
  assert.match(doc, /publication/);
  assert.match(doc, /ordinal 4 current-context replacement/);
});
