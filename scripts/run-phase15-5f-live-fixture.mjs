import { readFile } from "node:fs/promises";

import { resolveSourceAdmissionWithFullContext } from "../lib/sources/source-full-context-resolution.mjs";

if (process.env.ALLOW_PAID_SOURCE_FULL_CONTEXT !== "true") {
  console.error("PHASE15_5F_LIVE_ABORT=paid_execution_not_explicitly_enabled");
  process.exit(2);
}

if (!String(process.env.OPENAI_API_KEY ?? "").trim()) {
  console.error("PHASE15_5F_LIVE_ABORT=openai_api_key_missing");
  process.exit(3);
}

const queue = JSON.parse(
  await readFile(new URL("../tests/fixtures/phase15-5f-review-queue.json", import.meta.url), "utf8"),
);

if (!Array.isArray(queue) || queue.length !== 5) {
  console.error(`PHASE15_5F_LIVE_ABORT=unexpected_queue_size:${Array.isArray(queue) ? queue.length : "non_array"}`);
  process.exit(4);
}

const summaries = [];
for (const item of queue) {
  const signal = {
    id: item.id,
    source_platform: item.source_platform,
    canonical_url: item.canonical_url,
    author_handle: item.author_handle,
    raw_text: `${item.title}\n\n${item.snippet}`,
    source_metadata: {
      provider_title: item.title,
      provider_description: item.snippet,
    },
  };

  const result = await resolveSourceAdmissionWithFullContext(signal, { env: process.env });
  summaries.push({
    id: item.id,
    title: item.title,
    decision: result.decision,
    resolved: result.resolved,
    status: result.status,
    reason_codes: result.reason_codes,
    full_context_status: result.full_context?.status ?? null,
    full_context_chars: typeof result.full_context?.content_text === "string"
      ? result.full_context.content_text.length
      : null,
    full_context_error_code: result.full_context?.error_code ?? null,
    semantic: result.semantic ? {
      problem_claim: result.semantic.problem_claim,
      experience_actor: result.semantic.experience_actor,
      friction_cause: result.semantic.friction_cause,
      friction_specificity: result.semantic.friction_specificity,
      pain_centrality: result.semantic.pain_centrality,
      content_kind: result.semantic.content_kind,
      evidence_quote: result.semantic.evidence_quote,
      model: result.semantic.model ?? null,
      prompt_version: result.semantic.prompt_version ?? null,
    } : null,
  });
}

console.log(`PHASE15_5F_RESULT_JSON=${JSON.stringify(summaries)}`);

const unresolved = summaries.filter((item) => !item.resolved);
console.log(`PHASE15_5F_SUMMARY=resolved:${summaries.length - unresolved.length},unresolved:${unresolved.length}`);
if (unresolved.length) process.exit(5);
