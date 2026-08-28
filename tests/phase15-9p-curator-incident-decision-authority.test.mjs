import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeCuratorIncidentDecision,
  SOURCE_INCIDENT_CURATOR_DECISION_RPC,
  SOURCE_INCIDENT_CURATOR_DECISION_SCHEMA_VERSION,
  SOURCE_INCIDENT_CURATOR_DECISION_TABLE,
} from "../lib/sources/source-incident-curator-decision-service.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9P normalizes only frozen curator decision shapes", () => {
  assert.equal(SOURCE_INCIDENT_CURATOR_DECISION_TABLE, "ar_source_incident_curator_decisions");
  assert.equal(SOURCE_INCIDENT_CURATOR_DECISION_SCHEMA_VERSION, "source-incident-curator-decision-v0.1");
  assert.equal(SOURCE_INCIDENT_CURATOR_DECISION_RPC, "ar_record_source_incident_curator_decision");

  assert.equal(normalizeCuratorIncidentDecision({ evidenceDecision: "reject" }).incident_persistence_authorized, false);
  assert.equal(normalizeCuratorIncidentDecision({ evidenceDecision: "accept", incidentAction: "hold" }).incident_persistence_authorized, false);

  const created = normalizeCuratorIncidentDecision({
    evidenceDecision: "accept",
    incidentAction: "create_new",
    newIncidentKey: "  stable-new-key  ",
    newIncidentLabel: " New incident ",
  });
  assert.equal(created.new_incident_key, "stable-new-key");
  assert.equal(created.new_incident_label, "New incident");
  assert.equal(created.incident_persistence_authorized, true);

  const reused = normalizeCuratorIncidentDecision({
    evidenceDecision: "accept",
    incidentAction: "reuse_existing",
    existingIncidentId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(reused.incident_persistence_authorized, true);
});

test("15.9P rejects ambiguous decision shapes", () => {
  assert.throws(() => normalizeCuratorIncidentDecision({ evidenceDecision: "accept" }), /requires incidentAction/);
  assert.throws(() => normalizeCuratorIncidentDecision({
    evidenceDecision: "reject",
    incidentAction: "create_new",
    newIncidentKey: "forbidden",
  }), /Rejected evidence cannot carry/);
  assert.throws(() => normalizeCuratorIncidentDecision({
    evidenceDecision: "accept",
    incidentAction: "hold",
    existingIncidentId: "11111111-1111-4111-8111-111111111111",
  }), /hold cannot carry/);
  assert.throws(() => normalizeCuratorIncidentDecision({
    evidenceDecision: "accept",
    incidentAction: "reuse_existing",
    existingIncidentId: "11111111-1111-4111-8111-111111111111",
    newIncidentKey: "forbidden",
  }), /reuse_existing requires/);
});

test("migration 040 is private append-only and integrity-bound", async () => {
  const sql = await read("supabase/migrations/040_source_incident_curator_decisions.sql");
  assert.match(sql, /create table public\.ar_source_incident_curator_decisions/);
  assert.match(sql, /references public\.ar_source_formation_assessments\(id\)/);
  assert.match(sql, /references public\.ar_radar_curators\(user_id\)/);
  assert.match(sql, /unique \(formation_assessment_id\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select, insert on table public\.ar_source_incident_curator_decisions\s+to service_role/);
  assert.match(sql, /append-only; update\/delete is forbidden/);
  assert.match(sql, /Formation\/Source lineage mismatch/);
  assert.match(sql, /resolved eligible Formation assessment/);
  assert.match(sql, /reviewed integrity does not match durable Formation authority/);
  assert.match(sql, /Blind evaluation Source Signal cannot receive curator Incident decisions/);
  assert.match(sql, /downstream Incident\/Public Evidence authority/);
  assert.match(sql, /create_new curator decision requires an unused Incident key/);
  assert.match(sql, /reuse_existing curator decision requires an existing Incident/);
  assert.match(sql, /ar_record_source_incident_curator_decision/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ar_source_incidents\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ar_source_incident_links\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ar_public_problems\b/i);
  assert.doesNotMatch(sql, /ar_register_source_incident(?:_batch)?\s*\(/);
  assert.doesNotMatch(sql, /ar_set_public_problem_status\s*\(/);
});

test("15.9P service rebuilds 15.9O packet before one decision RPC", async () => {
  const service = await read("lib/sources/source-incident-curator-decision-service.mjs");
  const packet = service.indexOf("await buildCuratorIncidentDecisionPacket");
  const validation = service.indexOf("validateDecisionAgainstPacket(normalizedDecision, packet);", packet);
  const existing = service.indexOf("await requireNoExistingDecision");
  const rpc = service.indexOf("await serviceClient.rpc");
  assert.ok(packet >= 0 && packet < validation);
  assert.ok(validation >= 0 && validation < existing);
  assert.ok(existing >= 0 && existing < rpc);
  assert.match(service, /p_reviewed_context_content_sha256:\s*context\.content_sha256/);
  assert.match(service, /p_reviewed_evidence_quote_sha256:\s*evidence\.quote_sha256/);
  assert.doesNotMatch(service, /ar_register_source_incident/);
  assert.doesNotMatch(service, /ar_set_public_problem_status/);
  assert.doesNotMatch(service, /OPENAI_API_KEY/);
});

test("15.9P route derives curator identity and does not accept integrity hashes", async () => {
  const route = await read("app/api/radar/admin/source-signals/[signalId]/incident-decisions/route.js");
  assert.match(route, /export async function POST/);
  assert.match(route, /const \{ userId \} = await requireRadarCurator\(serviceClient\)/);
  assert.match(route, /curatorUserId:\s*userId/);
  assert.match(route, /formationAssessmentId:\s*body\?\.formationAssessmentId/);
  assert.doesNotMatch(route, /body\?\.(?:curatorUserId|contextContentSha256|evidenceQuoteSha256)/);
  assert.match(route, /recordCuratorIncidentDecision/);
});

test("15.9P reports one decision write and zero downstream writes", async () => {
  const service = await read("lib/sources/source-incident-curator-decision-service.mjs");
  assert.match(service, /database_write_statements:\s*1/);
  assert.match(service, /curator_decision_rows_written:\s*1/);
  assert.match(service, /incident_writes:\s*0/);
  assert.match(service, /source_incident_link_writes:\s*0/);
  assert.match(service, /public_problem_writes:\s*0/);
  assert.match(service, /public_evidence_writes:\s*0/);
  assert.match(service, /public_feed_writes:\s*0/);
  assert.match(service, /publication_performed:\s*false/);
});
