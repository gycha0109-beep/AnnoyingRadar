import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  executeApprovedIncidentDecision,
  SOURCE_INCIDENT_DECISION_EXECUTION_RPC,
  SOURCE_INCIDENT_DECISION_EXECUTION_TABLE,
} from "../lib/sources/source-incident-decision-execution-service.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.9Q requires an explicit durable decision id and never infers latest", async () => {
  assert.equal(SOURCE_INCIDENT_DECISION_EXECUTION_TABLE, "ar_source_incident_decision_executions");
  assert.equal(SOURCE_INCIDENT_DECISION_EXECUTION_RPC, "ar_execute_source_incident_curator_decision");

  await assert.rejects(
    executeApprovedIncidentDecision({}, { curatorUserId: "curator-1" }),
    /explicit curator decision id is required/i,
  );

  const service = await read("lib/sources/source-incident-decision-execution-service.mjs");
  assert.doesNotMatch(service, /order\s*\([^)]*(?:created_at|decided_at)/i);
  assert.doesNotMatch(service, /\.limit\s*\(/);
  assert.doesNotMatch(service, /\.maybeSingle\s*\(/);
});

test("15.9Q service performs exactly one governed execution RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          id: "execution-1",
          curator_decision_id: "decision-1",
          source_signal_id: "source-1",
          incident_id: "incident-1",
          incident_action: "create_new",
          executed_by_curator_user_id: "curator-1",
          executed_at: "2026-08-28T00:00:00Z",
        },
        error: null,
      };
    },
  };

  const result = await executeApprovedIncidentDecision(client, {
    decisionId: " decision-1 ",
    curatorUserId: " curator-1 ",
  });

  assert.deepEqual(calls, [{
    name: SOURCE_INCIDENT_DECISION_EXECUTION_RPC,
    args: {
      p_curator_user_id: "curator-1",
      p_curator_decision_id: "decision-1",
    },
  }]);
  assert.equal(result.curator_decision_id, "decision-1");
  assert.equal(result.incident_action, "create_new");
  assert.equal(result.runtime_posture.model_calls, 0);
  assert.equal(result.runtime_posture.database_rpc_calls, 1);
  assert.equal(result.runtime_posture.incident_rows_created, 1);
  assert.equal(result.runtime_posture.source_incident_link_rows_written, 1);
  assert.equal(result.runtime_posture.public_problem_writes, 0);
  assert.equal(result.runtime_posture.public_evidence_writes, 0);
  assert.equal(result.runtime_posture.public_feed_writes, 0);
  assert.equal(result.runtime_posture.publication_performed, false);
});

test("migration 041 binds Incident and link lineage to exact durable decision", async () => {
  const sql = await read("supabase/migrations/041_source_incident_decision_execution.sql");

  assert.match(sql, /add column created_from_curator_decision_id uuid/);
  assert.match(sql, /add column curator_decision_id uuid/);
  assert.match(sql, /create table public\.ar_source_incident_decision_executions/);
  assert.match(sql, /unique \(curator_decision_id\)/);
  assert.match(sql, /unique \(source_signal_id\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select on table public\.ar_source_incident_decision_executions\s+to service_role/);
  assert.match(sql, /append-only; update\/delete is forbidden/);
  assert.match(sql, /ar_execute_source_incident_curator_decision/);
  assert.match(sql, /explicit curator decision id is required; latest-decision inference is forbidden/i);
  assert.match(sql, /where decision\.id = p_curator_decision_id\s+for update/i);
  assert.match(sql, /incident_persistence_authorized <> true/);
  assert.match(sql, /already been executed/);
  assert.match(sql, /Blind evaluation Source Signal cannot receive Incident execution/);
  assert.match(sql, /Approved Source Signal already has Incident authority/);
  assert.match(sql, /Approved Source Signal already has Public Evidence authority/);
});

test("15.9Q create_new fails closed on identity drift instead of reusing Incident", async () => {
  const sql = await read("supabase/migrations/041_source_incident_decision_execution.sql");

  assert.match(sql, /decision_row\.incident_action = 'create_new'/);
  assert.match(sql, /where incident\.incident_key = decision_row\.new_incident_key/);
  assert.match(sql, /Approved create_new Incident key is no longer unused; reapproval is required/);
  assert.match(sql, /insert into public\.ar_source_incidents/);
  assert.match(sql, /created_from_curator_decision_id/);
  assert.doesNotMatch(sql, /on conflict \(incident_key\) do update/i);
  assert.doesNotMatch(sql, /ar_register_source_incident(?:_batch)?\s*\(/);
});

test("15.9Q reuse_existing consumes only the exact approved Incident id", async () => {
  const sql = await read("supabase/migrations/041_source_incident_decision_execution.sql");

  assert.match(sql, /where incident\.id = decision_row\.existing_incident_id\s+for share/i);
  assert.match(sql, /Approved reuse_existing Incident no longer exists; reapproval is required/);
});

test("15.9Q atomically writes link and execution lineage but no Public surface", async () => {
  const sql = await read("supabase/migrations/041_source_incident_decision_execution.sql");

  const incidentInsert = sql.indexOf("insert into public.ar_source_incidents");
  const linkInsert = sql.indexOf("insert into public.ar_source_incident_links");
  const executionInsert = sql.indexOf("insert into public.ar_source_incident_decision_executions");
  assert.ok(incidentInsert >= 0 && incidentInsert < linkInsert);
  assert.ok(linkInsert >= 0 && linkInsert < executionInsert);
  assert.match(sql, /curator_decision_id\s*\)\s*values/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ar_public_problems\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.ar_public_problem_evidence_snapshots\b/i);
  assert.doesNotMatch(sql, /update\s+public\.ar_public_problems\b/i);
  assert.doesNotMatch(sql, /ar_set_public_problem_status\s*\(/);
});

test("15.9Q route derives curator identity and decision authority from path", async () => {
  const route = await read("app/api/radar/admin/source-incident-decisions/[decisionId]/execute/route.js");

  assert.match(route, /export async function POST/);
  assert.match(route, /const \{ userId \} = await requireRadarCurator\(serviceClient\)/);
  assert.match(route, /const \{ decisionId \} = await params/);
  assert.match(route, /decisionId,/);
  assert.match(route, /curatorUserId:\s*userId/);
  assert.match(route, /executeApprovedIncidentDecision/);
  assert.doesNotMatch(route, /request\.json\s*\(/);
});
