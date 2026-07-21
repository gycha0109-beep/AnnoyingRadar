import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  route: "app/api/raw-inputs/[rawInputId]/extract/route.js",
  evidenceRoute: "app/api/raw-inputs/[rawInputId]/evidence/route.js",
  ui: "app/raw-inputs/[rawInputId]/evidence-review.js",
  extractor: "lib/evidence/openai-extractor.mjs",
  migration: "supabase/migrations/006_evidence_llm_extraction.sql",
  hardening: "supabase/migrations/007_harden_evidence_extraction_metadata.sql",
  env: ".env.local.example",
};

test("Phase 3 extraction route preserves auth, owner and guarded RPC boundaries", async () => {
  const route = await readFile(files.route, "utf8");
  assert.match(route, /requireUser\(\)/);
  assert.match(route, /assertRawInputOwner/);
  assert.match(route, /ar_begin_evidence_extraction/);
  assert.match(route, /ar_complete_evidence_extraction/);
  assert.match(route, /ar_fail_evidence_extraction/);
  assert.match(route, /randomUUID\(\)/);
  assert.match(route, /buildSafetyIdentifier/);
});

test("OpenAI boundary uses strict schema, store false and exact quote validation", async () => {
  const extractor = await readFile(files.extractor, "utf8");
  assert.match(extractor, /store: false/);
  assert.match(extractor, /type: "json_schema"/);
  assert.match(extractor, /strict: true/);
  assert.match(extractor, /sourceText\.includes\(originalText\)/);
  assert.match(extractor, /X-Client-Request-Id/);
  assert.doesNotMatch(extractor, /NEXT_PUBLIC_OPENAI/);
});

test("DB migrations guard stale attempts, metadata and service-role execution", async () => {
  const migration = await readFile(files.migration, "utf8");
  const hardening = await readFile(files.hardening, "utf8");
  assert.match(migration, /extraction_attempt_id/);
  assert.match(migration, /Stale or invalid extraction attempt/);
  assert.match(migration, /A delayed failure from an older request/);
  assert.match(migration, /revoke all on function public\.ar_begin_evidence_extraction/);
  assert.match(migration, /grant execute on function public\.ar_complete_evidence_extraction[^;]+service_role/);
  assert.match(hardening, /new\.raw_text is distinct from old\.raw_text/);
  assert.match(hardening, /new\.extraction_attempt_id := null/);
});

test("Evidence UI prioritizes AI extraction while retaining fixture regression path", async () => {
  const ui = await readFile(files.ui, "utf8");
  const evidenceRoute = await readFile(files.evidenceRoute, "utf8");
  const env = await readFile(files.env, "utf8");
  assert.match(ui, /AI Evidence 추출/);
  assert.match(ui, /AI 재추출/);
  assert.match(ui, /개발용 고정 fixture/);
  assert.match(ui, /\/extract/);
  assert.match(evidenceRoute, /extraction_error_code/);
  assert.match(env, /OPENAI_API_KEY/);
  assert.match(env, /OPENAI_EVIDENCE_MODEL/);
});
