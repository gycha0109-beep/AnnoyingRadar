import { strict as assert } from "node:assert";

import { createServiceClient } from "../lib/supabase/service.js";
import { getEvaluationSampleIds, loadCampaignPool } from "../lib/sources/blind-evaluation.mjs";
import { classifySourceAdmission } from "../lib/sources/source-admission-policy.mjs";
import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const serviceClient = createServiceClient();
const estimateOnly = process.argv.includes("--estimate-only");
const paidLlmOptIn = process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT === "true";

const pool = await loadCampaignPool(serviceClient);
const evaluationIds = await getEvaluationSampleIds(serviceClient);
const eligibleIds = pool.signalIds.filter((id) => !evaluationIds.has(id));
const signals = [];

for (let index = 0; index < eligibleIds.length; index += LOOKUP_CHUNK_SIZE) {
  const ids = eligibleIds.slice(index, index + LOOKUP_CHUNK_SIZE);
  const { data, error } = await serviceClient
    .from("ar_source_signals")
    .select("id, source_platform, canonical_url, author_handle, raw_text, source_metadata, published_at, last_seen_at")
    .in("id", ids);
  if (error) throw error;
  signals.push(...(data ?? []));
}

const queue = signals
  .map((signal) => ({ signal, admission: classifySourceAdmission(signal) }))
  .filter(({ admission }) => admission.decision === "review" && admission.requires_full_context)
  .sort((left, right) => String(left.signal.id).localeCompare(String(right.signal.id)));

console.log(`[source-full-context] campaign_pool=${pool.signalIds.length}`);
console.log(`[source-full-context] blind_evaluation_excluded=${evaluationIds.size}`);
console.log(`[source-full-context] eligible=${eligibleIds.length} review_queue=${queue.length}`);

if (estimateOnly) {
  console.log(JSON.stringify({
    status: "ESTIMATE_ONLY",
    campaign_pool: pool.signalIds.length,
    blind_evaluation_excluded: evaluationIds.size,
    eligible: eligibleIds.length,
    review_queue: queue.length,
    public_full_context_fetches_max: queue.length,
    paid_external_model_calls_max: queue.length,
    paid_live_opt_in_required: true,
    invariant: "Only REVIEW + requires_full_context enters Phase 15.5F; blind evaluation signals remain excluded.",
  }, null, 2));
  process.exit(0);
}

assert.equal(evaluationIds.size, 120, "Blind evaluation set must remain initialized and excluded");
assert.equal(
  paidLlmOptIn,
  true,
  "Paid selective full-context execution is disabled by default. Set ALLOW_PAID_SOURCE_FULL_CONTEXT=true for an explicitly approved live resolution run.",
);

const results = [];
for (const { signal } of queue) {
  const result = await resolveSourceAdmissionWithFullContext(signal);
  results.push({ signal, result });
  console.log(
    `[source-full-context] signal=${signal.id} status=${result.status} decision=${result.decision} reason=${result.reason_codes.join(",")}`,
  );
}

const summary = {
  candidate: results.filter(({ result }) => result.decision === "candidate").length,
  reject: results.filter(({ result }) => result.decision === "reject").length,
  review: results.filter(({ result }) => result.decision === "review").length,
  resolved: results.filter(({ result }) => result.resolved).length,
  unresolved: results.filter(({ result }) => !result.resolved).length,
};
const status = summary.unresolved === 0 ? "PASS" : "CONTINUATION_REQUIRED";

console.log(JSON.stringify({
  status,
  campaign_pool: pool.signalIds.length,
  blind_evaluation_excluded: evaluationIds.size,
  eligible: eligibleIds.length,
  queue_count: queue.length,
  summary,
  resolutions: results.map(({ signal, result }) => ({
    source_signal_id: signal.id,
    canonical_url: signal.canonical_url,
    decision: result.decision,
    status: result.status,
    reason_codes: result.reason_codes,
    fetch_status: result.full_context?.status ?? null,
    fetched_char_count: result.full_context?.original_char_count ?? null,
    fetched_truncated: result.full_context?.truncated ?? null,
    semantic: result.semantic ? {
      problem_claim: result.semantic.problem_claim,
      experience_actor: result.semantic.experience_actor,
      friction_cause: result.semantic.friction_cause,
      friction_specificity: result.semantic.friction_specificity,
      pain_centrality: result.semantic.pain_centrality,
      content_kind: result.semantic.content_kind,
      evidence_quote: result.semantic.evidence_quote,
      prompt_version: result.semantic.prompt_version,
      provider: result.semantic.provider,
      model: result.semantic.model,
      provider_request_id: result.semantic.provider_request_id,
      usage: result.semantic.usage,
    } : null,
  })),
  invariant: "No DB writes. Source Admission v0.8 policy remains unchanged; full-context failure preserves REVIEW.",
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
