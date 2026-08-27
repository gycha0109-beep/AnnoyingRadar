import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import {
  PHASE15_9A_ACQUISITION_FOCUS,
  PHASE15_9A_PRIMARY_SEED,
  PHASE15_9A_PUBLISHED_SIGNATURE,
  PHASE15_9A_VERSION,
} from "../lib/sources/phase15-9a-seed-authority.mjs";
import { createServiceClient } from "../lib/supabase/service.js";

const outputArg = process.argv.find((item) => item.startsWith("--output="));
const outputPath = outputArg?.slice("--output=".length) || "phase15-9a-post-publication-seed-audit.json";

async function exactCount(client, table, field, value) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq(field, value);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const client = createServiceClient();

  const { data: problems, error: problemError } = await client
    .from("ar_public_problems")
    .select("id, problem_signature, category, status, published_at, archived_at")
    .eq("problem_signature", PHASE15_9A_PUBLISHED_SIGNATURE);
  if (problemError) throw problemError;
  assert.equal(problems?.length, 1);
  const problem = problems[0];
  assert.equal(problem.status, "published");
  assert.ok(problem.published_at);
  assert.equal(problem.archived_at, null);

  const [evidenceRows, feedRows] = await Promise.all([
    exactCount(client, "ar_public_problem_evidence_snapshots", "public_problem_id", problem.id),
    exactCount(client, "ar_public_problem_feed", "id", problem.id),
  ]);
  assert.equal(evidenceRows, 2);
  assert.equal(feedRows, 1);

  const { data: seeds, error: seedError } = await client
    .from("ar_source_signals")
    .select("id, source_platform, external_content_id, content_hash")
    .eq("source_platform", PHASE15_9A_PRIMARY_SEED.source_platform)
    .eq("external_content_id", PHASE15_9A_PRIMARY_SEED.source_identity_sha256)
    .eq("content_hash", PHASE15_9A_PRIMARY_SEED.source_content_sha256);
  if (seedError) throw seedError;
  assert.equal(seeds?.length, 1);
  const seed = seeds[0];

  const [incidentLinks, outcomeResult] = await Promise.all([
    exactCount(client, "ar_source_incident_links", "source_signal_id", seed.id),
    client
      .from("ar_source_full_context_resolution_outcomes")
      .select("status, decision, problem_claim, experience_actor, friction_cause, friction_specificity, pain_centrality, content_kind, context_status, context_scope, context_content_sha256, context_char_count, context_truncated")
      .eq("source_signal_id", seed.id)
      .eq("batch_version", "phase15.8m-b-remainder-v0.1")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (outcomeResult.error) throw outcomeResult.error;
  assert.equal(outcomeResult.data?.length, 1);
  const outcome = outcomeResult.data[0];

  assert.equal(incidentLinks, 0);
  assert.equal(outcome.status, "resolved");
  assert.equal(outcome.decision, "candidate");
  assert.equal(outcome.problem_claim, "yes");
  assert.equal(outcome.experience_actor, "self");
  assert.equal(outcome.friction_cause, "external_service_or_product");
  assert.equal(outcome.friction_specificity, "concrete");
  assert.equal(outcome.pain_centrality, "central");
  assert.equal(outcome.content_kind, "organic");
  assert.equal(outcome.context_status, "resolved");
  assert.equal(outcome.context_scope, "full_post");
  assert.equal(outcome.context_content_sha256, PHASE15_9A_PRIMARY_SEED.full_context_sha256);
  assert.equal(outcome.context_truncated, false);

  const artifact = {
    phase: "15.9A",
    version: PHASE15_9A_VERSION,
    mode: "read_only",
    published_surface_state: {
      problem_signature: PHASE15_9A_PUBLISHED_SIGNATURE,
      status: problem.status,
      published_at: problem.published_at,
      internal_category: problem.category,
      evidence_rows: evidenceRows,
      feed_rows: feedRows,
    },
    primary_seed: {
      source_platform: PHASE15_9A_PRIMARY_SEED.source_platform,
      source_identity_sha256: PHASE15_9A_PRIMARY_SEED.source_identity_sha256,
      source_content_sha256: PHASE15_9A_PRIMARY_SEED.source_content_sha256,
      full_context_sha256: outcome.context_content_sha256,
      full_context_chars: outcome.context_char_count,
      curator_state: PHASE15_9A_PRIMARY_SEED.curator_state,
      incident_link_count: incidentLinks,
      repeat_ready: false,
      missing_requirement: "one_independent_same_mechanism_incident",
    },
    acquisition_focus: PHASE15_9A_ACQUISITION_FOCUS,
    next_authority: "targeted_source_acquisition_only",
    incident_creation_authorized: false,
    problem_signature_authorized: false,
    publication_authorized: false,
    database_writes: 0,
  };

  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "POST_PUBLICATION_SEED_AUDIT_COMPLETE",
    target_feed_rows: feedRows,
    target_evidence_rows: evidenceRows,
    seed_curator_state: PHASE15_9A_PRIMARY_SEED.curator_state,
    seed_incident_links: incidentLinks,
    next_authority: artifact.next_authority,
    database_writes: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[15.9A] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
