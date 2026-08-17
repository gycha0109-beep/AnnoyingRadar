import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_MARKDOWN_EXPORT_ARTIFACT_DIR
    ?? path.join("artifacts", "markdown-export-live-e2e", RUN_ID),
);

const baseUrl = normalizeBaseUrl(process.env.E2E_BASE_URL);
let browser;
let context;
let page;
let traceStarted = false;
let stepIndex = 0;
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const result = {
  run_id: RUN_ID,
  base_url: baseUrl,
  problem_candidate_id: null,
  idea_candidate_id: null,
  research_project_id: null,
  problem_export_verified: false,
  idea_export_verified: false,
  project_export_verified: false,
  browser_page_error_count: 0,
  hydration_error_count: 0,
  started_at: new Date().toISOString(),
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  try {
    if (!baseUrl) throw new Error("E2E_BASE_URL is required. Run this through npm run e2e:markdown-export:live.");
    console.log(`Markdown Export Live E2E 서버 주소: ${baseUrl}`);

    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    await step("discover-problem-and-idea", discoverProblemAndIdea);
    await step("verify-problem-export", verifyProblemExport);
    await step("verify-idea-export", verifyIdeaExport);
    await step("discover-project", discoverProject);
    await step("verify-project-export", verifyProjectExport);
    assertDiagnosticsClean();

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nMarkdownExportLiveE2E: PASS (problem=${result.problem_candidate_id}, idea=${result.idea_candidate_id}, project=${result.research_project_id})`);
    console.log("MarkdownExportLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)");
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nMarkdownExportLiveE2E: FAIL");
    console.error(result.error);
    await safeScreenshot("failure.png");
    process.exitCode = 1;
  } finally {
    result.browser_page_error_count = pageErrors.length;
    result.hydration_error_count = hydrationErrors().length;
    await persistDiagnostics();
    if (traceStarted && context) {
      try {
        await context.tracing.stop({ path: path.join(ARTIFACT_DIR, "trace.zip") });
      } catch (error) {
        console.error(`Trace 저장 실패: ${errorMessage(error)}`);
      }
    }
    if (KEEP_OPEN && browser) {
      console.log("E2E_KEEP_OPEN=1: 브라우저를 유지합니다. 종료하려면 Ctrl+C를 누르십시오.");
      await new Promise((resolve) => process.once("SIGINT", resolve));
    }
    await browser?.close().catch(() => {});
  }
}

async function authenticateManually() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  if (!(await isVisible(page.getByRole("button", { name: "로그아웃" })))) {
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "로그인" }).waitFor({ state: "visible" });
    console.log("브라우저에서 로그인하십시오. 로그인 완료를 자동 감지합니다.");
    await poll(
      async () => {
        const currentUrl = new URL(page.url());
        return currentUrl.origin === new URL(baseUrl).origin
          && currentUrl.pathname === "/"
          && await isVisible(page.getByRole("button", { name: "로그아웃" }));
      },
      LOGIN_TIMEOUT_MS,
      "로그인 완료",
    );
  }
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "로그아웃" }).waitFor({ state: "visible" });
}

async function discoverProblemAndIdea() {
  await page.goto(new URL("/problems/compare", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "문제 카드 비교", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const checkboxes = page.locator('input[name="ids"][type="checkbox"]');
  const count = await checkboxes.count();
  assert.ok(count >= 1, "confirmed Problem Card가 없습니다.");

  for (let index = 0; index < count; index += 1) {
    const candidateId = await checkboxes.nth(index).getAttribute("value");
    if (!candidateId) continue;
    const response = await context.request.get(new URL(`/api/problem-candidates/${candidateId}/ideas`, baseUrl).href);
    assert.equal(response.status(), 200, `Idea discovery API failed for ${candidateId}`);
    const body = await response.json();
    if (Array.isArray(body.ideas) && body.ideas.length > 0) {
      result.problem_candidate_id = candidateId;
      result.idea_candidate_id = body.ideas[0].id;
      return;
    }
  }

  throw new Error("Idea Candidate가 연결된 confirmed Problem Card를 찾지 못했습니다.");
}

async function verifyProblemExport() {
  const id = result.problem_candidate_id;
  assert.ok(id);
  await verifyExport({
    apiPath: `/api/exports/problem-candidates/${id}`,
    pagePath: `/problem-candidates/${id}`,
    expectedFilename: `problem-card-${id}.md`,
    requiredText: ["# Problem Card:", "## Evidence", "## Existing Services / Alternatives", "## Idea Candidates"],
    artifactName: "problem-card.md",
  });
  result.problem_export_verified = true;
}

async function verifyIdeaExport() {
  const id = result.idea_candidate_id;
  assert.ok(id);
  await verifyExport({
    apiPath: `/api/exports/idea-candidates/${id}`,
    pagePath: `/idea-candidates/${id}`,
    expectedFilename: `idea-candidate-${id}.md`,
    requiredText: ["# Idea Candidate:", "## Source Problem Card", "## Generation Provenance", "## Status History"],
    artifactName: "idea-candidate.md",
  });
  result.idea_export_verified = true;
}

async function discoverProject() {
  for (const pathName of ["/projects", "/projects?status=archived"]) {
    await page.goto(new URL(pathName, baseUrl).href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Research Project \d+개/ }).waitFor({ state: "visible", timeout: 30_000 });
    const links = page.locator('a.research-project-card[href^="/projects/"]');
    if (await links.count() === 0) continue;
    const href = await links.first().getAttribute("href");
    const match = href?.match(/^\/projects\/([^/?#]+)/);
    if (match?.[1]) {
      result.research_project_id = decodeURIComponent(match[1]);
      return;
    }
  }
  throw new Error("Research Project를 찾지 못했습니다.");
}

async function verifyProjectExport() {
  const id = result.research_project_id;
  assert.ok(id);
  await verifyExport({
    apiPath: `/api/exports/projects/${id}`,
    pagePath: `/projects/${id}`,
    expectedFilename: `research-project-${id}.md`,
    requiredText: ["# Research Project:", "## Purpose", "## Linked Problems", "## Linked Ideas"],
    artifactName: "research-project.md",
  });
  result.project_export_verified = true;
}

async function verifyExport({ apiPath, pagePath, expectedFilename, requiredText, artifactName }) {
  const url = new URL(apiPath, baseUrl).href;
  const first = await context.request.get(url);
  assert.equal(first.status(), 200, `${apiPath} first request failed`);
  assert.match(first.headers()["content-type"] ?? "", /^text\/markdown;\s*charset=utf-8/i);
  assert.equal(first.headers()["content-disposition"], `attachment; filename="${expectedFilename}"`);
  assert.match(first.headers()["cache-control"] ?? "", /private/);
  assert.match(first.headers()["cache-control"] ?? "", /no-store/);
  const firstBody = await first.text();

  const second = await context.request.get(url);
  assert.equal(second.status(), 200, `${apiPath} second request failed`);
  const secondBody = await second.text();
  assert.equal(firstBody, secondBody, `${apiPath} must be byte-deterministic for the same DB snapshot`);
  assert.ok(firstBody.endsWith("\n"));
  assert.doesNotMatch(firstBody, /generated_at|exported_at/i);
  for (const text of requiredText) assert.ok(firstBody.includes(text), `${apiPath} missing ${text}`);
  await writeFile(path.join(ARTIFACT_DIR, artifactName), firstBody, "utf8");

  await page.goto(new URL(pagePath, baseUrl).href, { waitUntil: "domcontentloaded" });
  const link = page.getByRole("link", { name: "Markdown 내보내기", exact: true });
  await link.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await link.getAttribute("href"), apiPath);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    link.click(),
  ]);
  assert.equal(download.suggestedFilename(), expectedFilename);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, `${expectedFilename} download path missing`);
  const downloadedBody = await readFile(downloadedPath, "utf8");
  assert.equal(downloadedBody, firstBody, `${expectedFilename} browser download differs from API bytes`);
}

function assertDiagnosticsClean() {
  const hydration = hydrationErrors();
  if (pageErrors.length) throw new Error(`브라우저 page error ${pageErrors.length}건 감지: ${pageErrors.join(" | ")}`);
  if (hydration.length) throw new Error(`hydration error ${hydration.length}건 감지: ${hydration.join(" | ")}`);
}

function hydrationErrors() {
  return consoleMessages.filter((message) => /Hydration failed|hydration mismatch/i.test(message));
}

async function step(name, operation) {
  stepIndex += 1;
  const label = `[${String(stepIndex).padStart(2, "0")}] ${name}`;
  console.log(`\n${label}`);
  const value = await operation();
  await safeScreenshot(`${String(stepIndex).padStart(2, "0")}-${slug(name)}.png`);
  return value;
}

function bindDiagnostics(targetPage) {
  targetPage.on("console", (message) => {
    consoleMessages.push(`[${new Date().toISOString()}] ${message.type()}: ${message.text()}`);
  });
  targetPage.on("pageerror", (error) => {
    pageErrors.push(`[${new Date().toISOString()}] ${errorMessage(error)}`);
  });
  targetPage.on("requestfailed", (request) => {
    requestFailures.push(
      `[${new Date().toISOString()}] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
}

async function persistDiagnostics() {
  await writeFile(path.join(ARTIFACT_DIR, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(ARTIFACT_DIR, "browser-console.log"), `${consoleMessages.join("\n")}\n`, "utf8");
  await writeFile(path.join(ARTIFACT_DIR, "page-errors.log"), `${pageErrors.join("\n")}\n`, "utf8");
  await writeFile(path.join(ARTIFACT_DIR, "request-failures.log"), `${requestFailures.join("\n")}\n`, "utf8");
}

async function safeScreenshot(filename) {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, filename), fullPage: true });
  } catch {
    // Diagnostics only.
  }
}

async function poll(operation, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await operation()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} 대기 시간 초과${lastError ? `: ${errorMessage(lastError)}` : ""}`);
}

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return new URL(value).href.replace(/\/$/, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}
