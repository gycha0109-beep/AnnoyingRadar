import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/021_publication_lineage_hardening.sql", import.meta.url);
const servicePath = new URL("../lib/radar/service.mjs", import.meta.url);
const linkRoutePath = new URL(
  "../app/api/radar/admin/problems/[publicProblemId]/source-problems/route.js",
  import.meta.url,
);
const unlinkRoutePath = new URL(
  "../app/api/radar/admin/problems/[publicProblemId]/source-problems/[problemCandidateId]/route.js",
  import.meta.url,
);
const designPath = new URL("../docs/phase15-1h-publication-lineage-hardening.md", import.meta.url);

test("Phase 15.1H stores internal N:M lineage without changing private identities", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create table if not exists public\.ar_public_problem_candidate_links/);
  assert.match(migration, /references public\.ar_public_problems\(id\)/);
  assert.match(migration, /references public\.ar_problem_candidates\(id\)/);
  assert.match(migration, /unique \(public_problem_id, problem_candidate_id\)/);
  assert.match(migration, /Only confirmed Problem Cards can be linked to a Public Problem/);
  assert.doesNotMatch(migration, /alter table public\.ar_problem_candidates\s+add column/i);
});

test("Publication lineage is curator-only and absent from public projections", async () => {
  const [migration, service] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(servicePath, "utf8"),
  ]);

  assert.match(migration, /revoke all on table public\.ar_public_problem_candidate_links[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.ar_public_problem_candidate_links[\s\S]*to service_role/);
  assert.match(migration, /ar_link_public_problem_candidate/);
  assert.match(migration, /ar_unlink_public_problem_candidate/);
  assert.match(service, /\.from\("ar_public_problem_candidate_links"\)/);
  assert.match(service, /source_problems: sourceProblems/);
  assert.doesNotMatch(service.split("export async function loadPublishedPublicProblemDetail")[1].split("export async function loadAdminPublicProblemDetail")[0], /ar_public_problem_candidate_links/);
});

test("Publication quality gate remains evidence-first and reusable", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create or replace function public\.ar_assert_public_problem_publishable/);
  assert.match(migration, /requires at least 2 Evidence snapshots/);
  assert.match(migration, /requires at least 2 distinct source_key values/);
  assert.match(migration, /publication_basis not in \('external_public', 'user_opt_in'\)/);
  assert.match(migration, /perform public\.ar_assert_public_problem_publishable\(p_problem_id\)/);
  assert.doesNotMatch(migration, /requires at least 1 source Problem/i);
});

test("Published Public Problem must be archived before substantive edits", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /Archive a published Public Problem before changing metadata/);
  assert.match(migration, /Archive a published Public Problem before changing publication lineage/);
  assert.match(migration, /v_problem\.status = 'published'/);
});

test("Curator lineage routes require curator authority and use dedicated RPCs", async () => {
  const [linkRoute, unlinkRoute] = await Promise.all([
    readFile(linkRoutePath, "utf8"),
    readFile(unlinkRoutePath, "utf8"),
  ]);

  assert.match(linkRoute, /requireRadarCurator\(serviceClient\)/);
  assert.match(linkRoute, /serviceClient\.rpc\("ar_link_public_problem_candidate"/);
  assert.match(unlinkRoute, /requireRadarCurator\(serviceClient\)/);
  assert.match(unlinkRoute, /serviceClient\.rpc\("ar_unlink_public_problem_candidate"/);
});

test("Phase 15.1H design freezes optional lineage and archive-before-edit", async () => {
  const design = await readFile(designPath, "utf8");

  assert.match(design, /관계는 N:M이다/);
  assert.match(design, /Lineage는 publication 필수 조건이 아니다/);
  assert.match(design, /Published 상태의 metadata, Evidence, lineage는 immutable하다/);
});
