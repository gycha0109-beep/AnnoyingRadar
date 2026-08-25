import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SOURCE_FULL_CONTEXT_OUTCOME_SCHEMA_VERSION,
  SOURCE_FULL_CONTEXT_OUTCOME_TABLE,
  buildSourceFullContextOutcomeRow,
  persistSourceFullContextOutcome,
} from "../lib/sources/source-full-context-outcome-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function candidateResult() {
  const content = "서비스 접수 이후 처리가 계속 지연되어 제가 고객센터에 여러 번 다시 연락했습니다.";
  return {
    version: "source-full-context-recovery-v0.1",
    base_resolution_version: "source-full-context-resolution-v0.1",
    status: "resolved",
    decision: "candidate",
    reason_codes: ["full_context_first_hand_external_friction"],
    full_context: {
      status: "resolved",
      content_text: content,
      content_scope: "full_post",
      truncated: false,
      canonical_url: "https://blog.naver.com/private/example",
      fetched_url: "https://m.blog.naver.com/PostView.naver?private=true",
    },
    semantic: {
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
      evidence_quote: "제가 고객센터에 여러 번 다시 연락했습니다.",
      prompt_version: "source-full-context-semantic-v0.1",
      provider: "openai",
      model: "test-model",
      provider_request_id: "req-sensitive",
      usage: { input_tokens: 100, output_tokens: 20 },
    },
    recovery: {
      version: "source-full-context-recovery-v0.1",
      attempted: true,
      recovered: true,
      attempt_count: 2,
      trigger_reason_code: "source_full_context_provider_incomplete",
      terminal_reason_code: null,
    },
  };
}

test("15.8M outcome row persists structured authority without source body or identity-bearing fetch fields", () => {
  const result = candidateResult();
  const row = buildSourceFullContextOutcomeRow({
    batchVersion: "phase15.8m-b-remainder-v0.1",
    sourceSignalId: "11111111-1111-4111-8111-111111111111",
    result,
    configuredModel: "test-model",
  });

  assert.equal(SOURCE_FULL_CONTEXT_OUTCOME_SCHEMA_VERSION, "source-full-context-outcome-v0.1");
  assert.equal(SOURCE_FULL_CONTEXT_OUTCOME_TABLE, "ar_source_full_context_resolution_outcomes");
  assert.equal(row.status, "resolved");
  assert.equal(row.decision, "candidate");
  assert.equal(row.problem_claim, "yes");
  assert.equal(row.friction_cause, "external_service_or_product");
  assert.equal(row.recovery_attempted, true);
  assert.equal(row.recovery_recovered, true);
  assert.equal(row.recovery_attempt_count, 2);
  assert.equal(
    row.context_content_sha256,
    createHash("sha256").update(result.full_context.content_text).digest("hex"),
  );

  for (const forbidden of [
    "content_text",
    "raw_text",
    "canonical_url",
    "fetched_url",
    "author_handle",
    "evidence_quote",
    "provider_request_id",
  ]) {
    assert.equal(Object.hasOwn(row, forbidden), false, `forbidden persisted field: ${forbidden}`);
  }
  assert.doesNotMatch(JSON.stringify(row), /private\/example|req-sensitive|고객센터에 여러 번/);
});

test("15.8M unresolved fetch failure persists no semantic facts and no context hash", () => {
  const row = buildSourceFullContextOutcomeRow({
    batchVersion: "phase15.8m-b-remainder-v0.1",
    sourceSignalId: "22222222-2222-4222-8222-222222222222",
    configuredModel: "test-model",
    result: {
      version: "source-full-context-recovery-v0.1",
      base_resolution_version: "source-full-context-resolution-v0.1",
      status: "unresolved",
      decision: "review",
      reason_codes: ["full_context_url_invalid"],
      full_context: { status: "unavailable", content_text: null, content_scope: null },
      semantic: null,
      recovery: {
        version: "source-full-context-recovery-v0.1",
        attempted: false,
        recovered: false,
        attempt_count: 0,
        trigger_reason_code: null,
        terminal_reason_code: null,
      },
    },
  });

  assert.equal(row.context_status, "unavailable");
  assert.equal(row.context_content_sha256, null);
  assert.equal(row.problem_claim, null);
  assert.equal(row.experience_actor, null);
  assert.equal(row.decision, "review");
});

test("15.8M persistence is append-only insert semantics and returns only safe metadata", async () => {
  let capturedTable = null;
  let capturedRow = null;
  let selected = null;
  const response = {
    id: "33333333-3333-4333-8333-333333333333",
    batch_version: "phase15.8m-b-remainder-v0.1",
    source_signal_id: "11111111-1111-4111-8111-111111111111",
    status: "resolved",
    decision: "candidate",
    reason_codes: ["full_context_first_hand_external_friction"],
    resolved_at: "2026-08-25T00:00:00Z",
    created_at: "2026-08-25T00:00:00Z",
  };
  const client = {
    from(table) {
      capturedTable = table;
      return {
        insert(row) {
          capturedRow = row;
          return {
            select(fields) {
              selected = fields;
              return { single: async () => ({ data: response, error: null }) };
            },
          };
        },
      };
    },
  };

  const persisted = await persistSourceFullContextOutcome({
    client,
    batchVersion: "phase15.8m-b-remainder-v0.1",
    sourceSignalId: "11111111-1111-4111-8111-111111111111",
    result: candidateResult(),
    configuredModel: "test-model",
  });
  assert.equal(capturedTable, SOURCE_FULL_CONTEXT_OUTCOME_TABLE);
  assert.equal(capturedRow.decision, "candidate");
  assert.doesNotMatch(selected, /problem_claim|model_name|context_content_sha256/);
  assert.deepEqual(persisted, response);
});

test("15.8M rejects partial semantic facts and unexpected resolved context scope", () => {
  const partial = candidateResult();
  delete partial.semantic.pain_centrality;
  assert.throws(() => buildSourceFullContextOutcomeRow({
    batchVersion: "x",
    sourceSignalId: "11111111-1111-4111-8111-111111111111",
    result: partial,
    configuredModel: "test-model",
  }), /semantic fields must be either complete or absent/);

  const wrongScope = candidateResult();
  wrongScope.full_context.content_scope = "snippet";
  assert.throws(() => buildSourceFullContextOutcomeRow({
    batchVersion: "x",
    sourceSignalId: "11111111-1111-4111-8111-111111111111",
    result: wrongScope,
    configuredModel: "test-model",
  }), /full_post scope/);
});

test("migration 034 is private, append-only, blind-guarded, and does not mutate the legacy semantic table", async () => {
  const migration = await read("supabase/migrations/034_source_full_context_resolution_outcomes.sql");
  assert.match(migration, /create table public\.ar_source_full_context_resolution_outcomes/);
  assert.match(migration, /unique \(batch_version, source_signal_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert on table public\.ar_source_full_context_resolution_outcomes\s+to service_role/);
  assert.doesNotMatch(migration, /grant[^;]*(?:update|delete)[^;]*ar_source_full_context_resolution_outcomes/i);
  assert.match(migration, /ar_guard_full_context_outcome_from_blind/);
  assert.match(migration, /ar_source_signal_evaluation_samples/);
  assert.doesNotMatch(migration, /alter table public\.ar_source_signal_semantic_judgments/i);
  assert.doesNotMatch(migration, /\bcontent_text\s+text\b|\bcanonical_url\s+text\b|\bauthor_handle\s+text\b|\bevidence_quote\s+text\b/i);
});
