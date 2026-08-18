import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";

test("Threads quote posts are held for review instead of auto-passing", () => {
  assert.deepEqual(
    runDeterministicComplaintPrefilter({
      raw_text: "이 얘기 공감됨",
      is_quote_post: true,
    }),
    { decision: "review", reason_codes: ["repost_or_copy"] },
  );
});

test("Gold annotations require a human reviewer and classification provenance is internally consistent", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/023_source_signal_complaint_gate.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /reviewed_by uuid not null/);
  assert.match(migration, /on delete restrict/);
  assert.match(migration, /ar_source_signal_classifications_prefilter_reason_check/);
  assert.match(migration, /ar_source_signal_classifications_reason_check/);
  assert.match(migration, /ar_source_signal_classifications_provider_contract/);
  assert.match(migration, /model_decision is not null[\s\S]*confidence is not null/);
});

test("Gold review queue can progress beyond the first page by prioritizing unlabeled signals", async () => {
  const service = await readFile(
    new URL("../lib/sources/complaint-service.mjs", import.meta.url),
    "utf8",
  );

  assert.match(service, /GOLD_REVIEW_CANDIDATE_LIMIT = 500/);
  assert.match(service, /Boolean\(left\.gold_annotation\)/);
  assert.match(service, /queue\.slice\(0, boundedLimit\)/);
});

test("service-role table grants are explicitly reduced to the complaint gate contract", async () => {
  const hardening = await readFile(
    new URL("../supabase/migrations/024_source_signal_complaint_gate_grant_hardening.sql", import.meta.url),
    "utf8",
  );

  assert.match(hardening, /revoke all on table public\.ar_source_signal_classifications from service_role/);
  assert.match(hardening, /grant select, insert on table public\.ar_source_signal_classifications to service_role/);
  assert.match(hardening, /revoke all on table public\.ar_source_signal_gold_annotations from service_role/);
  assert.match(hardening, /grant select, insert, update on table public\.ar_source_signal_gold_annotations to service_role/);
  assert.doesNotMatch(hardening, /grant[^;]*(?:delete|truncate)/i);
});
