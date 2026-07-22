import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  extractPainEvidence,
  getEvidenceProviderConfig,
} from "../lib/evidence/openai-extractor.mjs";

const cases = JSON.parse(
  await readFile(new URL("../tests/fixtures/evidence-extraction-cases.json", import.meta.url), "utf8"),
);
const config = getEvidenceProviderConfig();
const results = [];

for (const testCase of cases) {
  try {
    const output = await extractPainEvidence({
      rawText: testCase.raw_text,
      sourceLanguage: testCase.language,
      requestId: randomUUID(),
      safetyIdentifier: "ar_live_eval",
      ...config,
    });
    const quotes = output.evidences.map((item) => item.original_text);
    const emptyPass = testCase.expect_empty ? quotes.length === 0 : quotes.length > 0;
    const recallPass = testCase.expected_quote_fragments.every((fragment) =>
      quotes.some((quote) => quote.includes(fragment)),
    );
    results.push({
      id: testCase.id,
      pass: emptyPass && recallPass,
      evidence_count: quotes.length,
      quotes,
      usage: output.usage,
    });
  } catch (error) {
    results.push({ id: testCase.id, pass: false, error: error.code || error.message });
  }
}

const passed = results.filter((result) => result.pass).length;
console.log(JSON.stringify({ model: config.model, passed, total: results.length, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
