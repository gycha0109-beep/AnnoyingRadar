import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const MUTATION_ROUTES = [
  "app/api/raw-inputs/route.js",
  "app/api/raw-inputs/[rawInputId]/route.js",
  "app/api/raw-inputs/[rawInputId]/evidence/extract/route.js",
  "app/api/raw-inputs/[rawInputId]/evidence/confirm/route.js",
  "app/api/raw-inputs/[rawInputId]/candidates/group/route.js",
  "app/api/raw-inputs/[rawInputId]/complete/route.js",
  "app/api/problem-candidates/[candidateId]/route.js",
  "app/api/problem-candidates/[candidateId]/confirm/route.js",
  "app/api/problem-candidates/[candidateId]/discard/route.js",
  "app/api/problem-candidates/[candidateId]/restore/route.js",
  "app/api/problem-candidates/[candidateId]/evidence/route.js",
  "app/api/problem-candidates/[candidateId]/merge/route.js",
  "app/api/problem-candidates/[candidateId]/split/route.js",
  "app/api/problem-candidates/[candidateId]/save/route.js",
  "app/api/problem-candidates/[candidateId]/save/status/route.js",
];

test("all workflow mutation routes authenticate and retain user scoping", async () => {
  for (const relativePath of MUTATION_ROUTES) {
    const source = await read(relativePath);
    assert.match(source, /requireUser\s*\(/, `${relativePath}: authentication`);
    assert.match(
      source,
      /assert(?:RawInput|Candidate)Owner\s*\(|p_user_id\s*:\s*userId|user_id[^\n]*userId/,
      `${relativePath}: owner or RPC user scope`,
    );
  }
});

test("recent analysis re-entry remains owner scoped, ordered and limited to three", async () => {
  const source = await read("app/api/raw-inputs/recent/route.js");
  assert.match(source, /\.eq\("user_id",\s*userId\)/);
  assert.match(source, /\.order\("updated_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(source, /\.limit\(3\)/);

  const dashboard = await read("app/components/raw-input-dashboard.js");
  assert.match(dashboard, /최근 입력 3개/);
  assert.match(dashboard, /href=\{`\/raw-inputs\/\$\{rawInput\.id\}`\}/);
});

test("client modules never reference service-role credentials", async () => {
  const files = await walk(path.join(ROOT, "app"));
  for (const file of files.filter((entry) => /\.[cm]?[jt]sx?$/.test(entry))) {
    const source = await readFile(file, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(source, /SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/, path.relative(ROOT, file));
  }
});

test("database migration guards the state graph and completed is terminal", async () => {
  const migration = await read("supabase/migrations/010_analysis_status_transition_guard.sql");
  assert.match(migration, /before update of analysis_status/i);
  assert.match(migration, /using errcode = '23514'/i);
  assert.match(migration, /reviewing_candidates[^\n]+completed/i);
  assert.doesNotMatch(migration, /old\.analysis_status = 'completed'\s+and/i);
  assert.match(migration, /revoke all on function public\.ar_guard_analysis_status_transition\(\)/i);
});

test("completed analyses present confirmed records as Problem Cards", async () => {
  const source = await read("app/raw-inputs/[rawInputId]/candidate-grouping.js");
  assert.match(source, /analysisStatus === "completed"/);
  assert.match(source, /candidate\.status === "confirmed"/);
  assert.match(source, /Problem Card/);
  assert.match(source, /확정된 Candidate만 Problem Card/);
});

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const entryStat = await stat(absolutePath);
    if (entryStat.isDirectory()) files.push(...await walk(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}
