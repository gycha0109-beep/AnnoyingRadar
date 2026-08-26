import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createServiceClient } from "../lib/supabase/service.js";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";

const INCIDENT_KEY = "yeogieottae_reservation_fulfillment_gap_case";
const FETCH_COUNT = 4;
const DIFF_CONTEXT = 180;

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedDiff(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  let prefix = 0;
  const min = Math.min(left.length, right.length);
  while (prefix < min && left[prefix] === right[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;

  const leftStart = Math.max(0, prefix - DIFF_CONTEXT);
  const rightStart = Math.max(0, prefix - DIFF_CONTEXT);
  const leftEnd = Math.min(left.length, left.length - suffix + DIFF_CONTEXT);
  const rightEnd = Math.min(right.length, right.length - suffix + DIFF_CONTEXT);

  return {
    common_prefix_chars: prefix,
    common_suffix_chars: suffix,
    left_changed_chars: Math.max(0, left.length - prefix - suffix),
    right_changed_chars: Math.max(0, right.length - prefix - suffix),
    left_excerpt: left.slice(leftStart, leftEnd),
    right_excerpt: right.slice(rightStart, rightEnd),
  };
}

async function loadSource(client) {
  const { data: incidents, error: incidentError } = await client
    .from("ar_source_incidents")
    .select("id")
    .eq("incident_key", INCIDENT_KEY);
  if (incidentError) throw incidentError;
  assert.equal(incidents?.length, 1);

  const { data: links, error: linkError } = await client
    .from("ar_source_incident_links")
    .select("source_signal_id")
    .eq("incident_id", incidents[0].id);
  if (linkError) throw linkError;
  assert.equal(links?.length, 1);

  const { data: sources, error: sourceError } = await client
    .from("ar_source_signals")
    .select("source_platform, canonical_url")
    .eq("id", links[0].source_signal_id);
  if (sourceError) throw sourceError;
  assert.equal(sources?.length, 1);
  return sources[0];
}

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const outputPath = outputArg?.slice("--output=".length) || "phase15-8s-r-context-diagnosis.json";
  const client = createServiceClient();
  const source = await loadSource(client);
  const results = [];

  for (let i = 0; i < FETCH_COUNT; i += 1) {
    const context = await fetchSourceFullContext(source);
    assert.equal(context.status, "resolved");
    assert.equal(context.content_scope, "full_post");
    assert.equal(context.truncated, false);
    results.push(context);
    if (i + 1 < FETCH_COUNT) await sleep(1500);
  }

  const fetches = results.map((context, index) => ({
    ordinal: index + 1,
    hash: context.content_hash,
    recomputed_hash: sha256(context.content_text),
    char_count: context.original_char_count,
    line_count: String(context.content_text).split("\n").length,
    title_hash: sha256(context.title ?? ""),
  }));

  const pairwise = [];
  for (let i = 1; i < results.length; i += 1) {
    pairwise.push({
      left_ordinal: i,
      right_ordinal: i + 1,
      ...boundedDiff(results[i - 1].content_text, results[i].content_text),
    });
  }

  const artifact = {
    authority: "diagnostic_read_only",
    phase: "15.8S-R-context-stability",
    source_platform: source.source_platform,
    source_key_sha256: sha256(source.canonical_url),
    fetch_count: FETCH_COUNT,
    unique_hash_count: new Set(fetches.map((item) => item.hash)).size,
    fetches,
    pairwise,
    full_source_body_persisted: false,
    bounded_diff_context_chars: DIFF_CONTEXT,
    database_write_statements: 0,
    paid_semantic_calls: 0,
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "CONTEXT_STABILITY_DIAG_COMPLETE",
    unique_hash_count: artifact.unique_hash_count,
    fetches: fetches.map(({ ordinal, hash, char_count, line_count }) => ({ ordinal, hash, char_count, line_count })),
    output_path: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.8S-R-context-diagnosis] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
