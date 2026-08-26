import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PHASE15_8T_EVIDENCE_AUTHORITIES,
  PHASE15_8T_PROBLEM_SIGNATURE,
  PHASE15_8T_VERSION,
  reconstructPhase15_8TEvidence,
  validatePhase15_8TEvidenceAuthorities,
} from "../lib/sources/public-evidence-persistence-pair.mjs";
import { sha256 } from "../lib/sources/historical-evidence-span-readiness.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8T freezes exactly two distinct readiness authorities", () => {
  const authorities = validatePhase15_8TEvidenceAuthorities();
  assert.equal(PHASE15_8T_VERSION, "phase15.8t-public-evidence-persistence-v0.1");
  assert.equal(PHASE15_8T_PROBLEM_SIGNATURE, "lodging_reservation_fulfillment_gap");
  assert.equal(authorities.length, 2);
  assert.deepEqual(authorities.map((item) => item.order_index), [0, 1]);
  assert.deepEqual(authorities.map((item) => item.excerpt_length), [83, 19]);
  assert.equal(new Set(authorities.map((item) => item.incident_key)).size, 2);
  assert.equal(new Set(authorities.map((item) => item.source_key_sha256)).size, 2);
});

test("15.8T reconstructs Evidence only from exact current canonical span fingerprints", () => {
  const excerpt = "현재 canonical 본문에 존재하는 exact Evidence";
  const sourceKey = "https://example.test/post";
  const authority = {
    order_index: 0,
    incident_key: "incident_a",
    source_key_sha256: sha256(sourceKey),
    excerpt_length: excerpt.length,
    excerpt_sha256: sha256(excerpt),
    readiness_authority: "fixture",
  };
  const row = reconstructPhase15_8TEvidence({
    authority,
    incident: { id: "incident-id", incident_key: "incident_a" },
    source: {
      id: "source-id",
      source_platform: "naver_blog",
      canonical_url: sourceKey,
      published_at: null,
    },
    canonicalContext: {
      version: "source-full-context-fetch-v0.2",
      status: "resolved",
      content_scope: "full_post",
      truncated: false,
      title: "title",
      content_text: `앞 ${excerpt} 뒤`,
    },
  });
  assert.equal(row.excerpt, excerpt);
  assert.equal(row.source_key, sourceKey);
  assert.equal(row.order_index, 0);
});

test("15.8T atomic RPC requires exactly two distinct lineage-bound Evidence rows and validates publishability before commit", async () => {
  const migration = await read("supabase/migrations/037_atomic_incident_bound_public_evidence_pair.sql");
  assert.match(migration, /jsonb_array_length\(p_evidences\) <> 2/);
  assert.match(migration, /requires zero existing Evidence snapshots/);
  assert.match(migration, /two distinct Source Signals/);
  assert.match(migration, /two distinct Incidents/);
  assert.match(migration, /two distinct source_key values/);
  assert.match(migration, /order_index must be exactly 0 then 1/);
  assert.match(migration, /ar_add_incident_bound_public_problem_evidence\(/);
  assert.match(migration, /ar_assert_public_problem_publishable\(p_problem_id\)/);
  assert.match(migration, /revoke all on function public\.ar_add_incident_bound_public_problem_evidence_pair/);
  assert.match(migration, /grant execute on function public\.ar_add_incident_bound_public_problem_evidence_pair[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /ar_set_public_problem_status/);
});

test("15.8T runner performs four canonical fetches max, one atomic write RPC, and no publication/status transition", async () => {
  const script = await read("scripts/run-public-evidence-persistence-15-8t.mjs");
  assert.match(script, /public_full_context_fetches_max: 4/);
  assert.match(script, /paid_external_model_calls: 0/);
  assert.match(script, /atomic_rpc_calls: 1/);
  assert.match(script, /fetchSourceFullContext\(pair\.source\)/);
  assert.match(script, /assertStableCanonicalContexts\(first, second\)/);
  assert.match(script, /reconstructPhase15_8TEvidence/);
  assert.match(script, /ar_add_incident_bound_public_problem_evidence_pair/);
  assert.match(script, /targetFeedAfter, 0/);
  assert.match(script, /draftAfter\.status, "draft"/);
  assert.doesNotMatch(script, /ar_set_public_problem_status/);
  assert.doesNotMatch(script, /\.insert\(/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
});

test("15.8T workflow has no OpenAI dependency and only one temporary live branch", async () => {
  const workflow = await read(".github/workflows/source-public-evidence-persistence-15-8t.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8t-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PUBLIC_EVIDENCE_PAIR_PERSISTENCE: "true"/);
  assert.match(workflow, /run-public-evidence-persistence-15-8t\.mjs --live/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_/);
});

test("15.8T repo authority stores hashes and lengths, not the two real Evidence excerpts or raw Source UUIDs", async () => {
  const files = await Promise.all([
    read("lib/sources/public-evidence-persistence-pair.mjs"),
    read("scripts/run-public-evidence-persistence-15-8t.mjs"),
    read(".github/workflows/source-public-evidence-persistence-15-8t.yml"),
    read("supabase/migrations/037_atomic_incident_bound_public_evidence_pair.sql"),
  ]);
  for (const text of files) {
    assert.doesNotMatch(text, /0f33f4e4-dd0c-42f5-b14b-ac8d2e6fde45/);
    assert.doesNotMatch(text, /d5e70d0d-ddba-4ebd-998b-608d99338229/);
  }
  assert.equal(PHASE15_8T_EVIDENCE_AUTHORITIES[0].excerpt_sha256,
    "1cc568874a8e42fe1d690d132176fb994fbc74bcdca4852f9949ee7f926790aa");
  assert.equal(PHASE15_8T_EVIDENCE_AUTHORITIES[1].excerpt_sha256,
    "78e79d58584bafe49d78183c010985ba41d1fc691bdd02e599eed8832108959b");
});
