import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/031_incident_persistence_fk_index_hardening.sql", import.meta.url),
  "utf8",
);

test("Phase 15.6D hardening covers curator foreign keys", () => {
  assert.match(migration, /ar_idx_source_incidents_created_by/i);
  assert.match(migration, /ar_source_incidents \(created_by_user_id\)/i);
  assert.match(migration, /ar_idx_source_incident_links_curator/i);
  assert.match(migration, /ar_source_incident_links \(linked_by_curator_user_id\)/i);
});

test("duplicate source membership index is removed because UNIQUE(source_signal_id) already covers it", () => {
  assert.match(migration, /drop index if exists public\.ar_idx_source_incident_links_source/i);
});
