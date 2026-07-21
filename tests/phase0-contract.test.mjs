import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Raw Input routes enforce authentication before service-role access", async () => {
  for (const path of ["app/api/raw-inputs/route.js", "app/api/raw-inputs/recent/route.js", "app/api/raw-inputs/[rawInputId]/route.js"]) {
    const source = await read(path);
    assert.match(source, /requireUser\(\)/);
    assert.match(source, /createServiceClient\(\)/);
    assert.ok(source.indexOf("requireUser()") < source.indexOf("createServiceClient()"));
  }
});

test("Raw Input resources keep the ar_ prefix", async () => {
  const sources = await Promise.all(["app/api/raw-inputs/route.js", "app/api/raw-inputs/recent/route.js", "app/api/raw-inputs/[rawInputId]/route.js"].map(read));
  assert.ok(sources.every((source) => !source.includes('.from("raw_inputs")')));
  assert.ok(sources.some((source) => source.includes('ar_raw_inputs')));
});

test("service role is server-only", async () => {
  const source = await read("lib/supabase/service.js");
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
