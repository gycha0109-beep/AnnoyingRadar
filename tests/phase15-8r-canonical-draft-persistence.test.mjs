import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertPersistedCanonicalDraftMatchesPlan,
  buildCanonicalDraftOnlyPersistencePlan,
  CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION,
} from "../lib/sources/canonical-draft-only-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function readyDraftResult() {
  return {
    draft_state: "ready",
    reason_codes: ["draft_supported_by_independent_incidents"],
    draft: {
      problem_signature: "lodging_reservation_fulfillment_gap",
      title: "숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다",
      summary: "서로 다른 두 숙소 예약 사건에서 실제 예약 반영·이행 문제가 확인됐다.",
      target_user: "OTA 이용 여행자",
      situation: "예약 확정 후 숙소 측 예약이 확인되지 않는 상황",
      category: "travel_booking",
      source_signal_ids: ["source-a", "source-b"],
      incident_keys: ["incident-a", "incident-b"],
      source_count: 2,
      incident_count: 2,
      persistence_state: "not_persisted",
      publication_state: "not_published",
    },
  };
}

test("15.8R builds a draft-only persistence plan from a ready Q draft", () => {
  const plan = buildCanonicalDraftOnlyPersistencePlan({ draftResult: readyDraftResult() });
  assert.equal(plan.version, CANONICAL_DRAFT_ONLY_PERSISTENCE_VERSION);
  assert.equal(plan.persistence_state, "ready_for_draft_only_persistence");
  assert.equal(plan.rpc, "ar_create_canonical_public_problem_draft");
  assert.equal(plan.args.p_problem_signature, "lodging_reservation_fulfillment_gap");
  assert.equal(plan.invariants.source_count, 2);
  assert.equal(plan.invariants.incident_count, 2);
  assert.equal(plan.invariants.public_problem_status, "draft");
  assert.equal(plan.invariants.public_evidence_write_count, 0);
  assert.equal(plan.invariants.existing_problem_mutation_count, 0);
  assert.equal(plan.invariants.publication_count, 0);
});

test("15.8R refuses non-ready or identity-incomplete drafts", () => {
  assert.throws(() => buildCanonicalDraftOnlyPersistencePlan({ draftResult: { draft_state: "blocked" } }), /ready Canonical Problem draft/);

  const duplicateSource = readyDraftResult();
  duplicateSource.draft.source_signal_ids = ["same", "same"];
  assert.throws(() => buildCanonicalDraftOnlyPersistencePlan({ draftResult: duplicateSource }), /Source identity must be complete/);

  const alreadyPersisted = readyDraftResult();
  alreadyPersisted.draft.persistence_state = "persisted";
  assert.throws(() => buildCanonicalDraftOnlyPersistencePlan({ draftResult: alreadyPersisted }), /must not already claim persistence/);
});

test("persisted Canonical draft readback must exactly match the plan and remain non-public", () => {
  const plan = buildCanonicalDraftOnlyPersistencePlan({ draftResult: readyDraftResult() });
  const row = {
    problem_signature: plan.args.p_problem_signature,
    title: plan.args.p_title,
    summary: plan.args.p_summary,
    target_user: plan.args.p_target_user,
    situation: plan.args.p_situation,
    category: plan.args.p_category,
    status: "draft",
    published_at: null,
    archived_at: null,
  };
  assert.equal(assertPersistedCanonicalDraftMatchesPlan({ row, plan }), true);
  assert.throws(
    () => assertPersistedCanonicalDraftMatchesPlan({ row: { ...row, status: "published" }, plan }),
    /Expected values to be strictly equal/,
  );
});

test("migration 036 adds nullable signature identity, uniqueness, idempotent create, and service-role-only execution", async () => {
  const migration = await read("supabase/migrations/036_canonical_public_problem_draft_identity.sql");
  assert.match(migration, /add column if not exists problem_signature text/);
  assert.match(migration, /create unique index if not exists ar_public_problems_problem_signature_unique/);
  assert.match(migration, /where problem_signature is not null/);
  assert.match(migration, /create or replace function public\.ar_create_canonical_public_problem_draft/);
  assert.match(migration, /perform public\.ar_require_radar_curator/);
  assert.match(migration, /on conflict \(problem_signature\) where problem_signature is not null\s+do nothing/i);
  assert.match(migration, /existing canonical draft content differs from requested authority/);
  assert.doesNotMatch(migration, /update public\.ar_public_problems/i);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});

test("15.8R runner permits at most one governed write RPC and no Evidence/publication mutation", async () => {
  const script = await read("scripts/run-canonical-draft-persistence-15-8r.mjs");
  assert.equal((script.match(/\.rpc\(/g) ?? []).length, 1);
  assert.match(script, /"ar_create_canonical_public_problem_draft"/);
  assert.match(script, /ALLOW_CANONICAL_DRAFT_PERSISTENCE/);
  assert.doesNotMatch(script, /ar_add_incident_bound_public_problem_evidence/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.upsert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /expected\.public_problems \+= 1/);
  assert.match(script, /canonical_draft_evidence_count/);
  assert.match(script, /canonical_draft_public_feed_rows/);
  assert.match(script, /public_problem_id_emitted: false/);
  assert.match(script, /public_evidence_write_count: 0/);
  assert.match(script, /publication_count: 0/);
});

test("15.8R workflow is authoritative-main and temporarily one-shot triggerable", async () => {
  const workflow = await read(".github/workflows/source-canonical-draft-persistence-15-8r.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8r-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_CANONICAL_DRAFT_PERSISTENCE: "true"/);
  assert.match(workflow, /run-canonical-draft-persistence-15-8r\.mjs --live/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /retention-days: 1/);
});
