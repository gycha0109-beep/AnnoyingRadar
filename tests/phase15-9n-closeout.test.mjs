import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("15.9N closeout freezes implementation, correction, merge, migration, and live lineage", async () => {
  const docs = await read("docs/phase15-9n-formation-assessment-persistence.md");
  for (const authority of [
    "PR #150",
    "82c6c1c0a26aaf16d62defd9ebe2e2d4e996f937",
    "CI #500 = FAILURE",
    "PIE #134 = SUCCESS",
    "59d3dd9e7c7f80b687b69ad2deb7140e93607e09",
    "CI #501 = SUCCESS",
    "PIE #135 = SUCCESS",
    "d2b9fd17e360801569ea5af08cb84b6c87bf20d0",
    "CI #502 = SUCCESS",
    "20260827090327 source_formation_assessments",
    "run #1 = 33057599171",
    "artifact id = 9640308569",
    "sha256:469d2588fb663e8254b003bb29abf0be97dffef82e3a884c5c889d65c98c9bdc",
  ]) {
    assert.match(docs, new RegExp(escape(authority)));
  }
  assert.match(docs, /production helper\/service\/migration code was unchanged/i);
  assert.match(docs, /PHASE 15\.9N = CLOSED/);
});

test("15.9N live authority freezes one recovered eligible Formation assessment", async () => {
  const docs = await read("docs/phase15-9n-formation-assessment-persistence.md");
  for (const authority of [
    "source network requests = 1 / max 8",
    "model calls = 2 / max 2",
    "database write statements = 1",
    "Formation assessments = 0 → 1",
    "recovery attempted = true",
    "recovery recovered = true",
    "recovery attempt count = 2",
    "trigger = source_formation_provider_incomplete",
    "status = resolved",
    "formation_state = eligible",
    "reason = formation_grounded_external_friction",
    "problem_claim = yes",
    "experience_actor = self",
    "friction_specificity = concrete",
    "pain_centrality = central",
    "content_kind = organic",
    "source_origin = original",
    "friction_responsibility = external_process_or_policy",
    "4be5eae3f5caf2bdd1de325427dfa34ad2a8b80e6b13e717797bc3f2d061e463",
    "context char count = 3407",
    "fafd5798cf5e8cc9ffb82507d550163fd84202f4d9430c053906727cef4a775c",
    "evidence quote char count = 44",
    "evidence quote start = 2361",
    "evidence quote end = 2405",
    "model = gpt-5-mini-2025-08-07",
  ]) {
    assert.match(docs, new RegExp(escape(authority)));
  }
});

test("15.9N closeout freezes independent production counts and append-only DB boundary", async () => {
  const [docs, migration] = await Promise.all([
    read("docs/phase15-9n-formation-assessment-persistence.md"),
    read("supabase/migrations/039_source_formation_assessments.sql"),
  ]);

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
    "ar_source_formation_assessments = 1",
  ]) {
    assert.match(docs, new RegExp(escape(row)));
  }

  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert on table public\.ar_source_formation_assessments\s+to service_role/);
  assert.doesNotMatch(migration, /grant[^;]*(update|delete)/i);
  assert.match(migration, /ar_trg_guard_source_formation_assessment/);
});

test("15.9N closes manual-only and keeps persisted Formation outside downstream authority", async () => {
  const [workflow, docs, route, service] = await Promise.all([
    read(".github/workflows/source-formation-assessment-persistence-15-9n.yml"),
    read("docs/phase15-9n-formation-assessment-persistence.md"),
    read("app/api/radar/admin/source-signals/[signalId]/formation/route.js"),
    read("lib/sources/source-formation-persistence-service.mjs"),
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.doesNotMatch(workflow, /agent\/phase15-9n-live-execution/);
  assert.match(route, /assessSourceFormationForCurator/);
  assert.doesNotMatch(route, /persistFormationAssessmentForCurator/);
  assert.match(service, /durable_formation_assessment_not_incident_authority/);
  assert.match(service, /incident_identity_assigned:\s*false/);
  assert.match(service, /public_evidence_created:\s*false/);
  assert.match(service, /publication_mutated:\s*false/);
  assert.match(docs, /Formation eligible ≠ Incident approved/);
  assert.match(docs, /Formation persisted ≠ Public Evidence/);
  assert.match(docs, /Formation persisted ≠ publication/);
});
