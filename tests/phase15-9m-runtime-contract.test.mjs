import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const MUTATION_PATTERNS = [
  /\.insert\s*\(/,
  /\.upsert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.rpc\s*\(/,
];

test("15.9M closed workflow remains manual-only and checks out authoritative main", async () => {
  const workflow = await read(".github/workflows/source-curator-formation-handoff-15-9m.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /agent\/phase15-9m-live-execution/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /ref:\s*main/);
  assert.match(workflow, /ALLOW_PHASE15_9M_CURATOR_FORMATION_HANDOFF:\s*"true"/);
  assert.match(workflow, /retention-days:\s*1/);
});

test("15.9M route, service, and live runner remain mutation-free", async () => {
  const files = await Promise.all([
    read("app/api/radar/admin/source-signals/[signalId]/formation/route.js"),
    read("lib/sources/source-formation-service.mjs"),
    read("scripts/run-curator-formation-handoff-15-9m.mjs"),
  ]);
  for (const source of files) {
    for (const pattern of MUTATION_PATTERNS) assert.doesNotMatch(source, pattern);
  }
});

test("15.9M service explicitly enables the bounded external-web full-context policy", async () => {
  const service = await read("lib/sources/source-formation-service.mjs");
  assert.match(service, /fetchSourceFullContext/);
  assert.match(service, /SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(service, /externalWebPolicy:\s*SOURCE_FULL_CONTEXT_EXTERNAL_POLICY/);
  assert.match(service, /fetchContext:\s*fetchContext\s*\?\?\s*fetchFormationFullContext/);
});

test("15.9M live artifact contract excludes transport identity and raw source content", async () => {
  const runner = await read("scripts/run-curator-formation-handoff-15-9m.mjs");
  for (const token of [
    '"source_signal_id"',
    '"canonical_url"',
    '"fetched_url"',
    '"content_text"',
    '"raw_text"',
    '"author_handle"',
    '"provider_request_id"',
  ]) {
    assert.match(runner, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(runner, /assertArtifactPrivacy/);
  assert.match(runner, /database_writes:\s*0/);
});
