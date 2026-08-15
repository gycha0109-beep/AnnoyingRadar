import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";

import {
  generateGroundedIdeas,
  getIdeaProviderConfig,
} from "../lib/ideas/openai-generator.mjs";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const cases = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/idea-generation-cases.json", import.meta.url),
    "utf8",
  ),
);
const config = getIdeaProviderConfig();
const results = [];

for (const testCase of cases) {
  try {
    const output = await generateGroundedIdeas({
      problemCard: testCase.problem_card,
      evidences: testCase.evidences,
      requestId: randomUUID(),
      safetyIdentifier: "ar_idea_live_eval",
      ...config,
    });

    const semanticPass = output.ideas.every((idea) => {
      const text = [
        idea.title,
        idea.one_liner,
        idea.problem_statement,
        idea.core_value,
        idea.first_build_scope,
      ].join("\n");
      return testCase.semantic_terms_any.some((term) => text.includes(term));
    });
    const countPass = output.ideas.length >= 1 && output.ideas.length <= 3;
    const titles = output.ideas.map((idea) => idea.title);
    const distinctTitlePass = new Set(titles).size === titles.length;
    const knownEvidenceIds = new Set(testCase.evidences.map((evidence) => evidence.id));
    const groundingPass =
      output.grounding.length === output.ideas.length &&
      output.grounding.every(
        (item) =>
          item.evidence_ids.length >= 1 &&
          item.evidence_ids.every((id) => knownEvidenceIds.has(id)),
      );
    const hypothesisPass = output.ideas.every(
      (idea) =>
        idea.monetization_hint === null ||
        /^가설\s*:/u.test(idea.monetization_hint),
    );

    results.push({
      id: testCase.id,
      pass:
        semanticPass &&
        countPass &&
        distinctTitlePass &&
        groundingPass &&
        hypothesisPass,
      idea_count: output.ideas.length,
      ideas: output.ideas.map((idea, index) => ({
        title: idea.title,
        implementation_difficulty: idea.implementation_difficulty,
        monetization_hint: idea.monetization_hint,
        grounding_evidence_ids: output.grounding[index].evidence_ids,
      })),
      usage: output.usage,
    });
  } catch (error) {
    results.push({
      id: testCase.id,
      pass: false,
      error: error.code || error.message,
      message: error.message || null,
      provider_status: error.providerStatus ?? null,
      retryable: error.retryable ?? false,
    });
  }
}

const passed = results.filter((result) => result.pass).length;
console.log(
  JSON.stringify(
    { model: config.model, passed, total: results.length, results },
    null,
    2,
  ),
);
if (passed !== results.length) process.exitCode = 1;
