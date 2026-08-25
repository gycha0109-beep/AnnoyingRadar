import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PHASE15_8M_B_BATCH_VERSION,
  PHASE15_8M_B_EXPECTED_REMAINDER,
  PHASE15_8M_B_EXPECTED_REVIEWS,
  PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT,
  PHASE15_8M_B_SAMPLE_SIZE,
  selectPhase15_8MBRemainder,
} from "../lib/sources/new-supply-review-remainder.mjs";
import {
  persistSourceFullContextOutcomeRows,
  validateSourceFullContextOutcomeRows,
} from "../lib/sources/source-full-context-outcome-batch.mjs";
import { buildSourceFullContextOutcomeRow } from "../lib/sources/source-full-context-outcome-persistence.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function record(index) {
  return {
    domain: index % 2 === 0 ? "commerce" : "services",
    family: index % 3 === 0 ? "delay" : "damage",
    query_key: `q-${index % 5}`,
    signal: { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` },
  };
}

function candidateResult(content = "서비스 처리 지연 때문에 고객센터에 여러 번 다시 문의해야 했습니다.") {
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
    },
    semantic: {
      problem_claim: "yes",
      experience_actor: "self",
      friction_cause: "external_service_or_product",
      friction_specificity: "concrete",
      pain_centrality: "central",
      content_kind: "organic",
      evidence_quote: null,
      prompt_version: "source-full-context-semantic-v0.1",
      provider: "openai",
      model: "test-model",
    },
    recovery: {
      version: "source-full-context-recovery-v0.1",
      attempted: false,
      recovered: false,
      attempt_count: 1,
      trigger_reason_code: null,
      terminal_reason_code: null,
    },
  };
}

test("15.8M-B freezes the exact 130 minus 48 equals 82 authority", () => {
  assert.equal(PHASE15_8M_B_BATCH_VERSION, "phase15.8m-b-remainder-v0.1");
  assert.equal(PHASE15_8M_B_EXPECTED_REVIEWS, 130);
  assert.equal(PHASE15_8M_B_SAMPLE_SIZE, 48);
  assert.equal(PHASE15_8M_B_EXPECTED_REMAINDER, 82);
  assert.equal(PHASE15_8M_B_EXPECTED_SAMPLE_FINGERPRINT, "9a3c8192c57c48450ec1b39b5cc590cd6ccc5219869a23924a3d58a87a609be6");
});

test("remainder selection is an exact disjoint complement of the deterministic calibration sample", () => {
  const reviews = Array.from({ length: 10 }, (_, index) => record(index + 1));
  const selected = selectPhase15_8MBRemainder(reviews, {
    expectedReviewCount: 10,
    sampleSize: 4,
    expectedRemainderCount: 6,
    expectedSampleFingerprint: null,
  });

  assert.equal(selected.sample.length, 4);
  assert.equal(selected.remainder.length, 6);
  const sampleIds = new Set(selected.sample.map((item) => item.signal.id));
  const remainderIds = new Set(selected.remainder.map((item) => item.signal.id));
  assert.equal([...remainderIds].some((id) => sampleIds.has(id)), false);
  assert.equal(new Set([...sampleIds, ...remainderIds]).size, 10);
});

test("bulk persistence validates one batch, unique Sources, and one insert call", async () => {
  const rows = [1, 2].map((index) => buildSourceFullContextOutcomeRow({
    batchVersion: PHASE15_8M_B_BATCH_VERSION,
    sourceSignalId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    result: candidateResult(`서비스 처리 지연 때문에 고객센터에 ${index}번 이상 다시 문의해야 했습니다.`),
    configuredModel: "test-model",
  }));

  let insertCalls = 0;
  let capturedRows = null;
  const client = {
    from() {
      return {
        insert(value) {
          insertCalls += 1;
          capturedRows = value;
          return {
            async select() {
              return {
                data: value.map((row, index) => ({
                  id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
                  batch_version: row.batch_version,
                  source_signal_id: row.source_signal_id,
                  status: row.status,
                  decision: row.decision,
                  reason_codes: row.reason_codes,
                  evaluated_at: "2026-08-25T00:00:00Z",
                  created_at: "2026-08-25T00:00:00Z",
                })),
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const persisted = await persistSourceFullContextOutcomeRows({
    client,
    rows,
    expectedBatchVersion: PHASE15_8M_B_BATCH_VERSION,
    expectedCount: 2,
  });
  assert.equal(insertCalls, 1);
  assert.equal(capturedRows.length, 2);
  assert.equal(persisted.length, 2);
});

test("bulk persistence rejects duplicate Sources and forbidden durable fields before DB access", () => {
  const first = buildSourceFullContextOutcomeRow({
    batchVersion: PHASE15_8M_B_BATCH_VERSION,
    sourceSignalId: "33333333-3333-4333-8333-333333333333",
    result: candidateResult(),
    configuredModel: "test-model",
  });
  assert.throws(() => validateSourceFullContextOutcomeRows([first, { ...first }]), /duplicate Source Signal/);
  assert.throws(() => validateSourceFullContextOutcomeRows([{ ...first, canonical_url: "https://example.com" }]), /forbidden durable outcome field/);
});

test("15.8M-B runner keeps full bodies ephemeral and persists only after all 82 safe rows exist", async () => {
  const script = await read("scripts/run-new-supply-review-remainder-resolution.mjs");
  assert.match(script, /selectPhase15_8MBRemainder\(reviewQueue\)/);
  assert.match(script, /eligibleReasonCodes: PROVIDER_ONLY_RECOVERY_CODES/);
  assert.match(script, /buildSourceFullContextOutcomeRow/);
  assert.match(script, /safeRows\.push\(row\)/);
  assert.match(script, /assert\.equal\(safeRows\.length, PHASE15_8M_B_EXPECTED_REMAINDER/);
  assert.match(script, /persistSourceFullContextOutcomeRows/);
  assert.match(script, /quoteRecoveryAttempted, 0/);
  assert.doesNotMatch(script, /results\.push\(\{\s*record,\s*result/);
  assert.doesNotMatch(script, /persistSourceFullContextOutcome\(/);
});

test("15.8M-B workflow is bounded, checks out authoritative main, and only has the exact temporary live branch trigger", async () => {
  const workflow = await read(".github/workflows/source-new-supply-remainder-15-8m-b.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /agent\/phase15-8m-b-live-execution/);
  assert.match(workflow, /Checkout authoritative main/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ALLOW_PAID_SOURCE_FULL_CONTEXT: "true"/);
  assert.match(workflow, /run-new-supply-review-remainder-resolution\.mjs --live/);
  assert.doesNotMatch(workflow, /agent\/phase15-8m-b-remainder-resolution/);
});
