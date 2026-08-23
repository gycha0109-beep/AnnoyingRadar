import { strict as assert } from "node:assert";

import { createServiceClient } from "../lib/supabase/service.js";
import { getEvaluationSampleIds, loadCampaignPool } from "../lib/sources/blind-evaluation.mjs";
import { runDeterministicComplaintPrefilter } from "../lib/sources/complaint-contracts.mjs";
import { COMPLAINT_SILVER_VERSION } from "../lib/sources/semantic-contracts.mjs";
import { classifySourceSignalToSilver } from "../lib/sources/semantic-gate.mjs";

const LOOKUP_CHUNK_SIZE = 150;
const serviceClient = createServiceClient();
const estimateOnly = process.argv.includes("--estimate-only");
const paidLlmOptIn = process.env.ALLOW_PAID_SILVER_LLM === "true";
const pool = await loadCampaignPool(serviceClient);
const evaluationIds = await getEvaluationSampleIds(serviceClient);
const eligibleIds = pool.signalIds.filter((id) => !evaluationIds.has(id));

const { data: existing, error: existingError } = await serviceClient
  .from("ar_source_signal_silver_annotations")
  .select("source_signal_id")
  .eq("silver_version", COMPLAINT_SILVER_VERSION)
  .limit(10000);
if (existingError) throw existingError;
const completed = new Set((existing ?? []).map((row) => row.source_signal_id));
const pending = eligibleIds.filter((id) => !completed.has(id));

console.log(`[silver-semantic] campaign_pool=${pool.signalIds.length}`);
console.log(`[silver-semantic] blind_evaluation_excluded=${evaluationIds.size}`);
console.log(`[silver-semantic] eligible=${eligibleIds.length} completed=${completed.size} pending=${pending.length}`);

if (estimateOnly) {
  const estimate = await estimateExternalModelCalls(serviceClient, pending);
  console.log(JSON.stringify({
    status: "ESTIMATE_ONLY",
    campaign_pool: pool.signalIds.length,
    blind_evaluation_excluded: evaluationIds.size,
    eligible: eligibleIds.length,
    completed: completed.size,
    pending: pending.length,
    deterministic_hard_rejects: estimate.hardRejects,
    model_eligible_pending: estimate.modelEligible,
    external_model_calls_min: estimate.modelEligible,
    external_model_calls_max: estimate.modelEligible * 2,
    paid_live_opt_in_required: true,
    note: "Historical/experimental Silver only. Active source admission is deterministic and no-LLM.",
  }, null, 2));
  process.exit(0);
}

assert.equal(evaluationIds.size, 120, "Blind evaluation set must be initialized before Silver labeling");
assert.equal(
  paidLlmOptIn,
  true,
  "Paid Silver LLM execution is disabled by default. Set ALLOW_PAID_SILVER_LLM=true only for an explicitly approved experiment.",
);

const failures = [];
let processed = 0;
for (const signalId of pending) {
  try {
    const result = await classifySourceSignalToSilver(serviceClient, { signalId });
    processed += 1;
    console.log(`[silver-semantic] ${processed}/${pending.length} signal=${signalId} decision=${result.final_decision} certainty=${result.system_certainty}`);
  } catch (error) {
    failures.push({ signal_id: signalId, code: error?.code ?? null, message: error?.message ?? String(error) });
    console.error(`[silver-semantic] signal=${signalId} FAILED ${error?.code ?? "error"}: ${error?.message ?? error}`);
  }
}

const { count: afterCount, error: countError } = await serviceClient
  .from("ar_source_signal_silver_annotations")
  .select("*", { count: "exact", head: true })
  .eq("silver_version", COMPLAINT_SILVER_VERSION);
if (countError) throw countError;

const status = failures.length === 0 && Number(afterCount ?? 0) >= eligibleIds.length ? "PASS" : "CONTINUATION_REQUIRED";
console.log(JSON.stringify({
  status,
  silver_version: COMPLAINT_SILVER_VERSION,
  eligible: eligibleIds.length,
  processed_this_run: processed,
  silver_total: afterCount ?? 0,
  failures,
  invariant: "Blind human evaluation signals are excluded and every AI classification path is DB-guarded while labeling is open",
}, null, 2));
if (status !== "PASS") process.exitCode = 1;

async function estimateExternalModelCalls(client, signalIds) {
  if (signalIds.length === 0) return { hardRejects: 0, modelEligible: 0 };
  const rows = [];
  for (let index = 0; index < signalIds.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = signalIds.slice(index, index + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("ar_source_signals")
      .select("id, source_platform, raw_text, source_metadata, is_quote_post")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  const hardRejects = rows.filter((signal) => runDeterministicComplaintPrefilter(signal).decision === "reject").length;
  return { hardRejects, modelEligible: rows.length - hardRejects };
}
