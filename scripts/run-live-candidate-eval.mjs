import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";

import {
  getCandidateProviderConfig,
  groupProblemCandidates,
} from "../lib/candidates/openai-grouper.mjs";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const cases = JSON.parse(
  await readFile(new URL("../tests/fixtures/candidate-grouping-cases.json", import.meta.url), "utf8"),
);
const config = getCandidateProviderConfig();
const results = [];

for (const testCase of cases) {
  try {
    const output = await groupProblemCandidates({
      evidences: testCase.evidences,
      requestId: randomUUID(),
      safetyIdentifier: "ar_candidate_live_eval",
      ...config,
    });
    const candidateEvidenceIds = output.candidates.map((candidate) => candidate.evidence_ids);
    const allInputIds = testCase.evidences.map((evidence) => evidence.id).sort();
    const allOutputIds = candidateEvidenceIds.flat().sort();
    const partitionPass = JSON.stringify(allInputIds) === JSON.stringify(allOutputIds);
    const togetherPass = testCase.must_group_together.every((id) =>
      candidateEvidenceIds.some((ids) => ids.includes(id) && testCase.must_group_together.every((other) => ids.includes(other))),
    );
    const separatePass = testCase.must_separate.length < 2 || !candidateEvidenceIds.some((ids) =>
      testCase.must_separate.every((id) => ids.includes(id)),
    );
    const countPass = output.candidates.length >= testCase.expected_candidate_count_min;

    results.push({
      id: testCase.id,
      pass: partitionPass && togetherPass && separatePass && countPass,
      candidate_count: output.candidates.length,
      candidates: output.candidates.map((candidate) => ({
        title: candidate.title,
        evidence_ids: candidate.evidence_ids,
      })),
      usage: output.usage,
    });
  } catch (error) {
    results.push({ id: testCase.id, pass: false, error: error.code || error.message });
  }
}

const passed = results.filter((result) => result.pass).length;
console.log(JSON.stringify({ model: config.model, passed, total: results.length, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
