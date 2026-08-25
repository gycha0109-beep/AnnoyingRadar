import { createServiceClient } from "../supabase/service.js";
import { SOURCE_FULL_CONTEXT_OUTCOME_TABLE } from "./source-full-context-outcome-persistence.mjs";

const ALLOWED_ROW_KEYS = new Set([
  "outcome_schema_version",
  "batch_version",
  "source_signal_id",
  "resolution_version",
  "recovery_version",
  "status",
  "decision",
  "reason_codes",
  "problem_claim",
  "experience_actor",
  "friction_cause",
  "friction_specificity",
  "pain_centrality",
  "content_kind",
  "context_status",
  "context_scope",
  "context_content_sha256",
  "context_char_count",
  "context_truncated",
  "prompt_version",
  "provider",
  "model_name",
  "recovery_attempted",
  "recovery_recovered",
  "recovery_attempt_count",
  "recovery_trigger_reason_code",
  "recovery_terminal_reason_code",
]);

const FORBIDDEN_ROW_KEYS = new Set([
  "content_text",
  "raw_text",
  "canonical_url",
  "fetched_url",
  "author_handle",
  "evidence_quote",
  "provider_request_id",
  "provider_payload",
]);

export function validateSourceFullContextOutcomeRows(rows, {
  expectedBatchVersion = null,
  expectedCount = null,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError("rows must be a non-empty array");
  }
  if (expectedCount != null && rows.length !== expectedCount) {
    throw new RangeError(`outcome batch must contain exactly ${expectedCount} rows`);
  }

  const sourceIds = new Set();
  let batchVersion = null;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("every outcome row must be an object");
    }
    for (const key of Object.keys(row)) {
      if (FORBIDDEN_ROW_KEYS.has(key)) throw new RangeError(`forbidden durable outcome field: ${key}`);
      if (!ALLOWED_ROW_KEYS.has(key)) throw new RangeError(`unexpected durable outcome field: ${key}`);
    }

    const rowBatch = String(row.batch_version ?? "").trim();
    const sourceId = String(row.source_signal_id ?? "").trim();
    if (!rowBatch || !sourceId) throw new RangeError("batch_version and source_signal_id are required");
    if (batchVersion == null) batchVersion = rowBatch;
    if (rowBatch !== batchVersion) throw new RangeError("all outcome rows must use one batch version");
    if (expectedBatchVersion != null && rowBatch !== expectedBatchVersion) {
      throw new RangeError("outcome row batch version does not match the expected authority");
    }
    if (sourceIds.has(sourceId)) throw new RangeError("duplicate Source Signal in outcome batch");
    sourceIds.add(sourceId);
  }

  return rows;
}

export async function persistSourceFullContextOutcomeRows({
  client = null,
  rows,
  expectedBatchVersion = null,
  expectedCount = null,
}) {
  const safeRows = validateSourceFullContextOutcomeRows(rows, {
    expectedBatchVersion,
    expectedCount,
  });
  const service = client ?? createServiceClient();
  const { data, error } = await service
    .from(SOURCE_FULL_CONTEXT_OUTCOME_TABLE)
    .insert(safeRows)
    .select("id, batch_version, source_signal_id, status, decision, reason_codes, evaluated_at, created_at");
  if (error) throw error;
  const persisted = data ?? [];
  if (persisted.length !== safeRows.length) {
    throw new Error("bulk outcome insert did not return every inserted row");
  }
  return persisted;
}
