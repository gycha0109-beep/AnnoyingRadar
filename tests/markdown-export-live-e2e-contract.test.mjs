import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("Markdown export live command enters the hardened bootstrap", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(
    pkg.scripts["e2e:markdown-export:live"],
    "node scripts/run-markdown-export-live-e2e-bootstrap.mjs",
  );
});

test("Markdown export bootstrap preserves project-root, env and Windows spawn hardening", async () => {
  const source = await read("scripts/run-markdown-export-live-e2e-bootstrap.mjs");
  assert.match(source, /PROJECT_ROOT/);
  assert.match(source, /cwd:\s*PROJECT_ROOT/);
  assert.match(source, /env:\s*process\.env/);
  assert.match(source, /npm_execpath/);
  assert.match(source, /process\.platform === "win32"/);
  assert.match(source, /\.env\.local/);
  assert.match(source, /run-markdown-export-live-e2e\.mjs/);
});

test("Markdown export live E2E covers all export kinds and verifies byte determinism", async () => {
  const source = await read("scripts/run-markdown-export-live-e2e.mjs");
  assert.match(source, /\/api\/exports\/problem-candidates/);
  assert.match(source, /\/api\/exports\/idea-candidates/);
  assert.match(source, /\/api\/exports\/projects/);
  assert.match(source, /assert\.equal\(firstBody, secondBody/);
  assert.match(source, /browser download differs from API bytes/);
  assert.match(source, /Markdown 내보내기/);
  assert.doesNotMatch(source, /context\.request\.(post|patch|delete)\(/i);
  assert.match(source, /MarkdownExportLiveE2E: PASS/);
  assert.match(source, /MarkdownExportLiveE2EStrict: PASS \(browser page errors: 0, hydration errors: 0\)/);
});

test("Markdown export routes are authenticated, no-store attachments", async () => {
  for (const route of [
    "app/api/exports/problem-candidates/[candidateId]/route.js",
    "app/api/exports/idea-candidates/[ideaId]/route.js",
    "app/api/exports/projects/[projectId]/route.js",
  ]) {
    const source = await read(route);
    assert.match(source, /requireUser\(\)/);
    assert.match(source, /markdownAttachmentHeaders/);
    assert.match(source, /new Response/);
  }

  const renderer = await read("lib/exports/markdown.mjs");
  assert.match(renderer, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(renderer, /new Date\(/);
}

test("Markdown export live gate fails on page or hydration diagnostics", async () => {
  const source = await read("scripts/run-markdown-export-live-e2e.mjs");
  assert.match(source, /targetPage\.on\("pageerror"/);
  assert.match(source, /Hydration failed\|hydration mismatch/i);
  assert.match(source, /if \(pageErrors\.length\) throw new Error/);
  assert.match(source, /if \(hydration\.length\) throw new Error/);
  assert.match(source, /page-errors\.log/);
  assert.match(source, /browser-console\.log/);
});
