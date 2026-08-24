import { readFile } from "node:fs/promises";

import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";
import { resolveFullContextSemantic } from "../lib/sources/source-full-context-resolution.mjs";

const queue = JSON.parse(
  await readFile(new URL("../tests/fixtures/phase15-5f-review-queue.json", import.meta.url), "utf8"),
);

const observations = new Map([
  ["cd5938ce-0795-4579-a1e0-3ccd84353abf", {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: "끝없는 지연의 굴레에 갇혔습니다.",
  }],
  ["eaa87b64-4632-4933-bce4-6deca0a9c10b", {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "unknown",
    friction_specificity: "concrete",
    pain_centrality: "incidental",
    content_kind: "organic",
    evidence_quote: "근데 주문이 계속 취소되는 거임,,,","+"
  }],
  ["defa940f-b51c-4e8c-a134-f9522ee810be", {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: "숙소 답변이 오지 않아,\n\n기다려야한다는 내용만 전달받았다.",
  }],
  ["f96d57a4-6986-4294-9185-98474fe1a788", {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: "‘수리금액은 87만원입니다’",
  }],
  ["b12f82f8-04fb-458e-a8e6-db5728121ae2", {
    problem_claim: "yes",
    experience_actor: "self",
    friction_cause: "external_service_or_product",
    friction_specificity: "concrete",
    pain_centrality: "central",
    content_kind: "organic",
    evidence_quote: "6월 내내 환불을 회피했다.",
  }],
]);

if (queue.length !== 5 || observations.size !== 5) {
  console.error("PHASE15_5F_CLOSEOUT_ABORT=unexpected_queue_or_observation_size");
  process.exit(2);
}

const results = [];
for (const item of queue) {
  const semantic = observations.get(item.id);
  if (!semantic) {
    console.error(`PHASE15_5F_CLOSEOUT_ABORT=missing_observation:${item.id}`);
    process.exit(3);
  }

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

  const fullContext = await fetchSourceFullContext(signal);
  if (fullContext?.status !== "resolved" || !fullContext?.content_text) {
    console.error(`PHASE15_5F_CLOSEOUT_ABORT=full_context_unavailable:${item.id}:${fullContext?.error_code ?? "unknown"}`);
    process.exit(4);
  }
  if (!fullContext.content_text.includes(semantic.evidence_quote)) {
    console.error(`PHASE15_5F_CLOSEOUT_ABORT=evidence_quote_not_exact:${item.id}`);
    process.exit(5);
  }

  const final = resolveFullContextSemantic(semantic);
  results.push({
    id: item.id,
    title: item.title,
    decision: final.decision,
    resolved: final.resolved,
    reason_codes: final.reason_codes,
    semantic,
    full_context_chars: fullContext.content_text.length,
  });
}

console.log(`PHASE15_5F_RESOLUTION_JSON=${JSON.stringify(results)}`);
const counts = results.reduce((acc, item) => {
  acc[item.decision] = (acc[item.decision] ?? 0) + 1;
  return acc;
}, {});
console.log(`PHASE15_5F_RESOLUTION_COUNTS=${JSON.stringify(counts)}`);
if (results.some((item) => !item.resolved || item.decision === "review")) process.exit(6);
