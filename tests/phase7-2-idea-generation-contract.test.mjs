import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const generator = await readFile(
  new URL("../lib/ideas/openai-generator.mjs", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL("../lib/ideas/service.mjs", import.meta.url),
  "utf8",
);
const listRoute = await readFile(
  new URL("../app/api/problem-candidates/[candidateId]/ideas/route.js", import.meta.url),
  "utf8",
);
const generateRoute = await readFile(
  new URL(
    "../app/api/problem-candidates/[candidateId]/ideas/generate/route.js",
    import.meta.url,
  ),
  "utf8",
);
const migration = await readFile(
  new URL("../supabase/migrations/011_idea_candidate_foundation.sql", import.meta.url),
  "utf8",
);
const envExample = await readFile(new URL("../.env.local.example", import.meta.url), "utf8");
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("Phase 7.2 generator is grounded only in confirmed Problem Card and linked Evidence", () => {
  assert.match(generator, /grounded-idea-generator-v1/);
  assert.match(generator, /strict: true/);
  assert.match(generator, /store: false/);
  assert.match(generator, /grounding_evidence_refs/);
  assert.match(generator, /unknown Evidence/);
  assert.match(generator, /untrusted data/i);
  assert.match(generator, /validated or proven demand/);
  assert.match(generator, /monetization_hint is only a hypothesis/);
  assert.match(generator, /implementation_difficulty is only a provisional estimate/);
  assert.doesNotMatch(generator, /raw_input_text|full_raw_input|content_raw/);
});

test("Phase 7.2 source loader locks eligibility to confirmed + completed + linked confirmed Evidence", () => {
  assert.match(service, /\.eq\("status", "confirmed"\)/);
  assert.match(service, /candidate\.status !== "confirmed"/);
  assert.match(service, /rawInput\.analysis_status !== "completed"/);
  assert.match(service, /candidate\.evidence_count/);
  assert.match(service, /ar_problem_evidence_links/);
  assert.match(service, /problem_card_evidence_inconsistent/);
});

test("Idea generation route validates source before provider call and persists through Phase 7.1 RPC", () => {
  const sourceLoadIndex = generateRoute.indexOf("loadIdeaGenerationSource");
  const providerCallIndex = generateRoute.indexOf("generateGroundedIdeas");
  assert.ok(sourceLoadIndex >= 0);
  assert.ok(providerCallIndex > sourceLoadIndex);

  assert.match(generateRoute, /requireUser/);
  assert.match(generateRoute, /createServiceClient/);
  assert.match(generateRoute, /ar_persist_idea_generation_batch/);
  assert.match(generateRoute, /p_ideas: generation\.ideas/);
  assert.match(generateRoute, /IDEA_PROMPT_VERSION/);
  assert.doesNotMatch(generateRoute, /\.from\("ar_idea_candidates"\)\s*\.insert/);

  assert.match(
    migration,
    /create or replace function public\.ar_persist_idea_generation_batch/,
  );
  assert.match(migration, /jsonb_array_length\(p_ideas\) not between 1 and 3/);
});

test("Idea list route is authenticated and owner-scoped", () => {
  assert.match(listRoute, /requireUser/);
  assert.match(listRoute, /assertCandidateOwner/);
  assert.match(listRoute, /loadIdeaCandidatesForProblemCard/);
});

test("Phase 7.2 environment and live eval commands are explicit", () => {
  assert.match(envExample, /OPENAI_IDEA_MODEL=/);
  assert.match(envExample, /OPENAI_IDEA_TIMEOUT_MS=/);
  assert.equal(packageJson.scripts["eval:ideas:live"], "node scripts/run-live-idea-eval.mjs");
});
