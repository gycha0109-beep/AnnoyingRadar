import { readFile } from "node:fs/promises";

import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";

const queue = JSON.parse(
  await readFile(new URL("../tests/fixtures/phase15-5f-review-queue.json", import.meta.url), "utf8"),
);
const index = Number(process.env.PHASE15_5F_FETCH_INDEX);
if (!Number.isInteger(index) || index < 0 || index >= queue.length) {
  console.error(`PHASE15_5F_FETCH_ABORT=invalid_index:${process.env.PHASE15_5F_FETCH_INDEX ?? "missing"}`);
  process.exit(2);
}

const item = queue[index];
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

const result = await fetchSourceFullContext(signal);
console.log(`PHASE15_5F_FULL_CONTEXT_JSON=${JSON.stringify({
  index,
  id: item.id,
  title: item.title,
  canonical_url: item.canonical_url,
  status: result?.status ?? null,
  error_code: result?.error_code ?? null,
  source_url: result?.source_url ?? null,
  content_scope: result?.content_scope ?? null,
  title_from_page: result?.title ?? null,
  content_text: result?.content_text ?? null,
})}`);
if (result?.status !== "resolved" || !result?.content_text) process.exit(3);
