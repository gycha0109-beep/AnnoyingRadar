import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard creates Raw Inputs through the existing authenticated API", async () => {
  const source = await read("app/components/raw-input-dashboard.js");

  assert.match(source, /fetch\("\/api\/raw-inputs"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /responsePayload\?\.raw_input_id/);
  assert.match(source, /router\.push\(`\/raw-inputs\/\$\{rawInputId\}`\)/);
  assert.doesNotMatch(source, /service_role|createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
});

test("dashboard loads the recent three-entry API contract", async () => {
  const source = await read("app/components/raw-input-dashboard.js");

  assert.match(source, /fetch\("\/api\/raw-inputs\/recent"/);
  assert.match(source, /payload\?\.raw_inputs/);
  assert.match(source, /recentRawInputs\.map/);
});

test("detail page requires an authenticated Supabase user", async () => {
  const source = await read("app/raw-inputs/[rawInputId]/page.js");

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /if \(!user\?\.id\)/);
  assert.match(source, /redirect\("\/login"\)/);
});

test("editor reads and patches the same owned Raw Input endpoint", async () => {
  const source = await read("app/raw-inputs/[rawInputId]/raw-input-editor.js");

  assert.match(source, /fetch\(`\/api\/raw-inputs\/\$\{rawInputId\}`/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /responsePayload\?\.raw_input/);
  assert.match(source, /hasRawInputChanges/);
  assert.doesNotMatch(source, /service_role|createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Phase 1 keeps the 200,000-character input boundary in the browser", async () => {
  const dashboard = await read("app/components/raw-input-dashboard.js");
  const editor = await read("app/raw-inputs/[rawInputId]/raw-input-editor.js");

  assert.match(dashboard, /maxLength=\{MAX_RAW_TEXT_LENGTH\}/);
  assert.match(editor, /maxLength=\{MAX_RAW_TEXT_LENGTH\}/);
});
