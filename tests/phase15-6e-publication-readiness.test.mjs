import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPublicProblemPublicationReadiness } from "../lib/radar/publication-readiness.mjs";

function problem() {
  return { title: "반복 문제", summary: "서로 다른 사건에서 반복된 문제", status: "draft" };
}

function evidence() {
  return [
    {
      id: "e1",
      source_key: "source-a",
      source_signal_id: "signal-a",
      incident_id: "incident-1",
      publication_basis: "external_public",
    },
    {
      id: "e2",
      source_key: "source-b",
      source_signal_id: "signal-b",
      incident_id: "incident-2",
      publication_basis: "external_public",
    },
  ];
}

function links() {
  return [
    { source_signal_id: "signal-a", incident_id: "incident-1" },
    { source_signal_id: "signal-b", incident_id: "incident-2" },
  ];
}

test("two independent incident-bound Evidence rows are structurally publishable", () => {
  const readiness = buildPublicProblemPublicationReadiness({ problem: problem(), evidence: evidence(), incidentLinks: links() });
  assert.equal(readiness.structurally_publishable, true);
  assert.equal(readiness.editorially_approved, false);
  assert.deepEqual(readiness.stats, {
    evidence_count: 2,
    distinct_source_count: 2,
    distinct_incident_count: 2,
    missing_incident_count: 0,
    invalid_basis_count: 0,
    invalid_external_binding_count: 0,
  });
});

test("two source keys from one incident do not pass repetition readiness", () => {
  const rows = evidence().map((item) => ({ ...item, incident_id: "incident-1" }));
  const binding = [
    { source_signal_id: "signal-a", incident_id: "incident-1" },
    { source_signal_id: "signal-b", incident_id: "incident-1" },
  ];
  const readiness = buildPublicProblemPublicationReadiness({ problem: problem(), evidence: rows, incidentLinks: binding });
  assert.equal(readiness.structurally_publishable, false);
  assert.equal(readiness.stats.distinct_source_count, 2);
  assert.equal(readiness.stats.distinct_incident_count, 1);
  assert.equal(readiness.checks.find((item) => item.code === "incident_diversity").ok, false);
});

test("missing or mismatched Source-to-Incident binding blocks readiness", () => {
  const readiness = buildPublicProblemPublicationReadiness({
    problem: problem(),
    evidence: evidence(),
    incidentLinks: [{ source_signal_id: "signal-a", incident_id: "incident-1" }],
  });
  assert.equal(readiness.structurally_publishable, false);
  assert.equal(readiness.stats.invalid_external_binding_count, 1);
});

test("curator detail service projects incident lineage without raw source body", async () => {
  const source = await readFile(new URL("../lib/radar/service.mjs", import.meta.url), "utf8");
  assert.match(source, /from\("ar_source_incident_links"\)/);
  assert.match(source, /from\("ar_source_incidents"\)/);
  assert.match(source, /from\("ar_source_signals"\)/);
  assert.match(source, /publication_readiness: buildPublicProblemPublicationReadiness/);
  assert.match(source, /incident_lineage_valid/);
  assert.doesNotMatch(source, /CURATOR_SOURCE_SIGNAL_SELECT[\s\S]*raw_text/);
});

test("publication endpoint requires explicit curator confirmation", async () => {
  const source = await readFile(
    new URL("../app/api/radar/admin/problems/[publicProblemId]/status/route.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /status === "published" && body\.publication_confirmed !== true/);
  assert.match(source, /publication_confirmation_required/);
  assert.match(source, /ar_set_public_problem_status/);
});
