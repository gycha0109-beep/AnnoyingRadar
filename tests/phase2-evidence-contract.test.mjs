import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  evidenceRoute: "app/api/raw-inputs/[rawInputId]/evidence/route.js",
  fixtureRoute: "app/api/raw-inputs/[rawInputId]/evidence/fixture/route.js",
  confirmRoute: "app/api/raw-inputs/[rawInputId]/evidence/confirm/route.js",
  reviewUi: "app/raw-inputs/[rawInputId]/evidence-review.js",
  migration: "supabase/migrations/004_evidence_review_rpcs.sql",
  hardening: "supabase/migrations/005_harden_evidence_review_rpcs.sql",
};

test("Phase 2 routes preserve authenticated owner and RPC boundaries", async () => {
  const evidenceRoute = await readFile(files.evidenceRoute, "utf8");
  const fixtureRoute = await readFile(files.fixtureRoute, "utf8");
  const confirmRoute = await readFile(files.confirmRoute, "utf8");

  for (const source of [evidenceRoute, fixtureRoute, confirmRoute]) {
    assert.match(source, /requireUser\(\)/);
    assert.match(source, /assertRawInputOwner/);
  }

  assert.match(evidenceRoute, /ar_update_evidence_batch/);
  assert.match(fixtureRoute, /ar_replace_evidence_fixture/);
  assert.match(confirmRoute, /ar_confirm_evidence_review/);
  assert.match(fixtureRoute, /ALLOW_EVIDENCE_FIXTURE/);
});

test("Evidence confirmation is atomic and service-role only", async () => {
  const migration = await readFile(files.migration, "utf8");
  const hardening = await readFile(files.hardening, "utf8");
  const combined = `${migration}\n${hardening}`;

  assert.match(combined, /security definer/g);
  assert.match(combined, /Every active Evidence must be classified exactly once/);
  assert.match(combined, /analysis_status = 'grouping'/);
  assert.match(combined, /revoke all on function public\.ar_confirm_evidence_review/);
  assert.match(combined, /grant execute on function public\.ar_confirm_evidence_review[^;]+service_role/);
});

test("Evidence UI exposes fixture, edit, delete and confirm flow", async () => {
  const reviewUi = await readFile(files.reviewUi, "utf8");
  assert.match(reviewUi, /고정 Evidence 준비/);
  assert.match(reviewUi, /수정 내용 저장/);
  assert.match(reviewUi, /deleted 처리/);
  assert.match(reviewUi, /grouping 진입/);
});
