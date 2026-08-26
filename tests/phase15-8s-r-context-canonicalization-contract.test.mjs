import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("15.8S-R canonicalization correction does not weaken Evidence or persistence authority", async () => {
  const fetcher = await read("lib/sources/source-full-context-fetch.mjs");
  const residual = await read("lib/sources/public-evidence-residual.mjs");
  const runner = await read("scripts/run-public-evidence-residual-15-8s-r.mjs");

  assert.match(fetcher, /source-full-context-fetch-v0\.2/);
  assert.match(fetcher, /extractBalancedElementContent/);
  assert.match(residual, /phase15\.8s-r-evidence-residual-v0\.2/);
  assert.match(residual, /PHASE15_8S_R_PRIOR_V01_CONTEXT_HASH/);
  assert.match(residual, /assertStableCanonicalContexts/);
  assert.match(runner, /maxSemanticAttempts: 1/);
  assert.match(runner, /exact_excerpt_persisted_in_artifact: false/);
  assert.match(runner, /public_evidence_persistence_authorized: false/);
  assert.match(runner, /publication_authorized: false/);

  for (const primitive of [/\.rpc\(/, /\.insert\(/, /\.upsert\(/, /\n\s*\.update\(/, /\.delete\(/]) {
    assert.doesNotMatch(runner, primitive);
  }
});
