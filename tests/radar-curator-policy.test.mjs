import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/020_radar_curator_explicit_deny_policy.sql",
  import.meta.url,
);

test("Radar curator table has an explicit deny-by-default browser policy", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /for select to anon, authenticated/);
  assert.match(migration, /using \(false\)/);
  assert.doesNotMatch(migration, /grant select/);
});
