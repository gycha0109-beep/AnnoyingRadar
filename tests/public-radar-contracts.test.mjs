import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizePublicEvidenceCreate,
  normalizePublicEvidencePatch,
  normalizePublicProblemCreate,
  normalizePublicProblemListQuery,
  normalizePublicProblemPatch,
  normalizePublicProblemStatus,
} from "../lib/radar/contracts.mjs";

const foundationMigrationPath = new URL("../supabase/migrations/017_public_radar_foundation.sql", import.meta.url);
const projectionMigrationPath = new URL("../supabase/migrations/018_public_radar_read_projection.sql", import.meta.url);
const securityMigrationPath = new URL("../supabase/migrations/019_public_radar_security_invoker_views.sql", import.meta.url);
const publicServicePath = new URL("../lib/radar/service.mjs", import.meta.url);
const publicListRoutePath = new URL("../app/api/radar/problems/route.js", import.meta.url);
const adminRoutePath = new URL("../app/api/radar/admin/problems/route.js", import.meta.url);
const designPath = new URL("../docs/phase15-public-radar-domain.md", import.meta.url);

test("Public Problem create contract trims content and keeps public metadata small", () => {
  const value = normalizePublicProblemCreate({
    title: "  혼자 주문하면 최소주문금액을 맞추기 어렵다  ",
    summary: "  불필요한 메뉴 추가로 이어진다.  ",
    target_user: "  1인 주문자  ",
    situation: "  한 끼 배달 주문  ",
    category: "  배달  ",
  });

  assert.equal(value.title, "혼자 주문하면 최소주문금액을 맞추기 어렵다");
  assert.equal(value.summary, "불필요한 메뉴 추가로 이어진다.");
  assert.equal(value.target_user, "1인 주문자");
  assert.equal(value.category, "배달");
});

test("Public Problem patch rejects lifecycle mutation", () => {
  assert.throws(() => normalizePublicProblemPatch({ status: "published" }), /unsupported Public Problem field/);
  assert.equal(normalizePublicProblemStatus("published"), "published");
  assert.throws(() => normalizePublicProblemStatus("merged"), /draft, published, or archived/);
});

test("Public Evidence only accepts publishable bases", () => {
  const valid = normalizePublicEvidenceCreate({
    excerpt: "최소주문금액 때문에 음료를 추가하게 된다.",
    publication_basis: "external_public",
    source_key: "threads:example-1",
    source_type: "threads",
  });
  assert.equal(valid.publication_basis, "external_public");
  assert.equal(valid.source_key, "threads:example-1");

  assert.throws(
    () => normalizePublicEvidenceCreate({ excerpt: "private", publication_basis: "private_research", source_key: "private:1" }),
    /external_public or user_opt_in/,
  );
});

test("Public Evidence patch allows clearing optional provenance fields", () => {
  assert.deepEqual(normalizePublicEvidencePatch({ source_url: null, order_index: null }), {
    source_url: null,
    order_index: null,
  });
});

test("Public list query bounds anonymous discovery inputs", () => {
  assert.deepEqual(normalizePublicProblemListQuery(new URLSearchParams("q=헬스장&category=운동&limit=25")), {
    q: "헬스장",
    category: "운동",
    limit: 25,
  });
  assert.throws(() => normalizePublicProblemListQuery(new URLSearchParams("limit=500")), /between 1 and 50/);
});

test("DB contract separates public Radar from private research tables", async () => {
  const migration = await readFile(foundationMigrationPath, "utf8");
  assert.match(migration, /create table if not exists public\.ar_radar_curators/);
  assert.match(migration, /create table if not exists public\.ar_public_problems/);
  assert.match(migration, /create table if not exists public\.ar_public_problem_evidence_snapshots/);
  assert.match(migration, /publication_basis in \('external_public', 'user_opt_in'\)/);
  assert.match(migration, /status in \('draft', 'published', 'archived'\)/);
  assert.match(migration, /requires at least 2 Evidence snapshots/);
  assert.match(migration, /requires at least 2 distinct source_key values/);
  assert.doesNotMatch(migration, /alter table public\.ar_raw_inputs/);
  assert.doesNotMatch(migration, /alter table public\.ar_pain_evidences/);
  assert.doesNotMatch(migration, /alter table public\.ar_problem_candidates/);
});

test("Anonymous readers only receive security-invoker public-safe projections", async () => {
  const [projection, security, service, publicRoute, adminRoute] = await Promise.all([
    readFile(projectionMigrationPath, "utf8"),
    readFile(securityMigrationPath, "utf8"),
    readFile(publicServicePath, "utf8"),
    readFile(publicListRoutePath, "utf8"),
    readFile(adminRoutePath, "utf8"),
  ]);

  assert.match(projection, /create view public\.ar_public_problem_feed/);
  assert.match(security, /security_invoker = true/);
  assert.match(security, /revoke all on table public\.ar_public_problems from anon, authenticated/);
  assert.match(security, /grant select \([\s\S]*search_text[\s\S]*\) on public\.ar_public_problems to anon, authenticated/);
  assert.match(security, /grant select \([\s\S]*updated_at[\s\S]*\) on public\.ar_public_problem_evidence_snapshots to anon, authenticated/);
  assert.doesNotMatch(security, /created_by_user_id/);
  assert.doesNotMatch(security, /updated_by_user_id/);
  assert.doesNotMatch(
    security,
    /grant select \([\s\S]*?source_key[\s\S]*?\) on public\.ar_public_problem_evidence_snapshots/,
  );
  assert.match(service, /\.from\("ar_public_problem_feed"\)/);
  assert.match(service, /\.from\("ar_public_problem_evidence_feed"\)/);
  assert.doesNotMatch(publicRoute, /requireUser\(/);
  assert.doesNotMatch(publicRoute, /createServiceClient\(/);
  assert.match(adminRoute, /requireRadarCurator\(serviceClient\)/);
});

test("Phase 15 design freezes evidence count semantics and delayed trend", async () => {
  const design = await readFile(designPath, "utf8");
  assert.match(design, /"12명이 겪었습니다"\s+❌/);
  assert.match(design, /"12건의 공개 근거에서 확인" ⭕/);
  assert.match(design, /Trend는 stable observation 조건이 확보되기 전에는 제공하지 않는다/);
  assert.match(design, /Personal Problem Card와 Public Problem은 다른 canonical identity다/);
});
