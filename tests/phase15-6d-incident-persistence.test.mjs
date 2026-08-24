import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCanonicalProblemPersistencePlan } from "../lib/sources/canonical-problem-persistence.mjs";

const migration = await readFile(
  new URL("../supabase/migrations/030_incident_aware_public_problem_persistence.sql", import.meta.url),
  "utf8",
);

function readyDraft(overrides = {}) {
  return {
    draft_state: "ready",
    draft: {
      problem_signature: "gym_refund_enforcement",
      title: "헬스장 환불 지연이 장기화되면 소비자가 외부 절차를 직접 밟아야 한다",
      summary: "서로 다른 두 환불 분쟁에서 정상적인 환불 요청만으로 처리가 끝나지 않았다.",
      target_user: "헬스장·PT 이용권 환불을 요청하는 소비자",
      situation: "환불 지연이 장기화된 상황",
      category: "consumer_refund",
      source_signal_ids: ["source-a", "source-b", "source-c"],
      incident_keys: ["incident-one", "incident-two"],
      source_count: 3,
      incident_count: 2,
      ...overrides,
    },
  };
}

function evidence() {
  return [
    {
      source_signal_id: "source-a",
      incident_key: "incident-one",
      excerpt: "환불을 요청했지만 처리가 장기화됐다.",
      source_key: "naver:a",
      source_url: "https://example.com/a",
    },
    {
      source_signal_id: "source-b",
      incident_key: "incident-one",
      excerpt: "같은 사건의 후속 절차를 진행했다.",
      source_key: "naver:b",
      source_url: "https://example.com/b",
    },
    {
      source_signal_id: "source-c",
      incident_key: "incident-two",
      excerpt: "별도의 환불 분쟁에서도 외부 절차가 필요했다.",
      source_key: "naver:c",
      source_url: "https://example.com/c",
    },
  ];
}

test("persistence plan preserves three Sources as two independent incidents", () => {
  const plan = buildCanonicalProblemPersistencePlan({ draftResult: readyDraft(), evidence: evidence() });
  assert.equal(plan.persistence_state, "ready");
  assert.equal(plan.publication_state, "not_published");
  assert.deepEqual(plan.invariants, {
    source_count: 3,
    incident_count: 2,
    distinct_source_key_count: 3,
  });
  assert.equal(plan.incidents.length, 2);
  assert.deepEqual(plan.incidents.find((item) => item.incident_key === "incident-one").source_signal_ids, ["source-a", "source-b"]);
});

test("persistence plan rejects incomplete or substituted Source identity", () => {
  assert.throws(
    () => buildCanonicalProblemPersistencePlan({ draftResult: readyDraft(), evidence: evidence().slice(0, 2) }),
    /cover the draft Source Signals exactly once/,
  );

  const changed = evidence();
  changed[2] = { ...changed[2], source_signal_id: "source-x" };
  assert.throws(
    () => buildCanonicalProblemPersistencePlan({ draftResult: readyDraft(), evidence: changed }),
    /cover the draft Source Signals exactly once/,
  );
});

test("persistence plan rejects incident collapse and duplicate Source rows", () => {
  const collapsed = evidence().map((row) => ({ ...row, incident_key: "incident-one" }));
  assert.throws(
    () => buildCanonicalProblemPersistencePlan({ draftResult: readyDraft(), evidence: collapsed }),
    /incident identity does not match the draft/,
  );

  const duplicated = [...evidence(), { ...evidence()[0] }];
  assert.throws(
    () => buildCanonicalProblemPersistencePlan({ draftResult: readyDraft(), evidence: duplicated }),
    /only one persistence Evidence row/,
  );
});

test("migration persists Incident as first-class identity and hardens publication gate", () => {
  assert.match(migration, /create table public\.ar_source_incidents/i);
  assert.match(migration, /create table public\.ar_source_incident_links/i);
  assert.match(migration, /add column source_signal_id uuid/i);
  assert.match(migration, /add column incident_id uuid/i);
  assert.match(migration, /unique \(source_signal_id\)/i);
  assert.match(migration, /count\(distinct incident_id\)/i);
  assert.match(migration, /requires at least 2 distinct incident_id values/i);
  assert.match(migration, /ar_add_incident_bound_public_problem_evidence/i);
  assert.match(migration, /Source Signal is not bound to the supplied incident/i);
});

test("source diversity remains a provenance requirement in addition to incident diversity", () => {
  assert.match(migration, /count\(distinct source_key\)/i);
  assert.match(migration, /requires at least 2 distinct source_key values/i);
});
