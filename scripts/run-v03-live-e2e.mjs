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
  process.env.E2E_V03_ARTIFACT_DIR ?? path.join("artifacts", "v03-live-e2e", RUN_ID),
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
  category: null,
  problem_candidate_id: null,
  idea_candidate_id: null,
  research_project_id: null,
  category_archive_verified: false,
  comparison_verified: false,
  problem_assets_verified: false,
  idea_board_verified: false,
  project_verified: false,
  exports_verified: false,
  browser_page_error_count: 0,
  hydration_error_count: 0,
  started_at: new Date().toISOString(),
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  try {
    if (!baseUrl) throw new Error("E2E_BASE_URL is required. Run this through npm run e2e:v0.3:live.");
    console.log(`v0.3 Product Live E2E 서버 주소: ${baseUrl}`);

    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("protected-route-redirect", verifyProtectedRouteRedirect);
    await step("login", authenticateManually);
    await step("home-v03", verifyHomeV03);
    await step("category-problem-archive", verifyCategoryProblemArchive);
    const catalogIds = await step("problem-comparison", verifyProblemComparison);
    await step("problem-research-assets", verifyProblemResearchAssets);
    await step("idea-board-and-detail", () => verifyIdeaBoardAndDetail(catalogIds));
    await step("research-project", verifyResearchProject);
    await step("markdown-export-smoke", verifyMarkdownExports);
    assertDiagnosticsClean();

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(
      `\nV03ProductLiveE2E: PASS (problem=${result.problem_candidate_id}, idea=${result.idea_candidate_id}, project=${result.research_project_id}, category=${result.category})`,
    );
    console.log("V03ProductLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)");
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nV03ProductLiveE2E: FAIL");
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

async function verifyProtectedRouteRedirect() {
  await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 30_000 });
  await page.getByRole("heading", { name: "로그인" }).waitFor({ state: "visible" });
}

async function authenticateManually() {
  if (new URL(page.url()).pathname !== "/login") {
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "domcontentloaded" });
  }
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

async function verifyHomeV03() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("v0.3 · Personal Research Workspace", { exact: true }).waitFor({ state: "visible" });
  const assets = page.locator('section[aria-labelledby="research-assets-title"]');
  await assets.getByRole("heading", { name: "v0.3 리서치 자산 바로가기" }).waitFor({ state: "visible" });
  for (const name of ["Saved Problems", "Problem Compare", "Idea Board", "Research Projects"]) {
    await assets.getByRole("link", { name, exact: true }).waitFor({ state: "visible" });
  }
  await page.locator('textarea[name="raw_text"]').waitFor({ state: "visible", timeout: 30_000 });
}

async function verifyCategoryProblemArchive() {
  await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
  const archive = page.locator('section[aria-labelledby="saved-problem-category-title"]');
  await archive.getByRole("heading", { name: "카테고리별 Problem Archive" }).waitFor({ state: "visible", timeout: 30_000 });

  const categoryLinks = archive.locator('a[href*="category="]');
  assert.ok(await categoryLinks.count() >= 1, "카테고리가 지정된 Saved Problem이 필요합니다.");
  const categoryHref = await categoryLinks.first().getAttribute("href");
  assert.ok(categoryHref);
  const category = new URL(categoryHref, baseUrl).searchParams.get("category");
  assert.ok(category);
  result.category = category;

  await page.goto(new URL(categoryHref, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByText(`선택: ${category}`, { exact: true }).waitFor({ state: "visible" });
  const cards = page.locator("article.saved-problem-card");
  assert.ok(await cards.count() >= 1, `${category} active Saved Problem이 없습니다.`);

  const problemHref = await cards.first().getByRole("link", { name: "Problem Card 열기", exact: true }).getAttribute("href");
  const problemMatch = problemHref?.match(/^\/problem-candidates\/([^/#?]+)/);
  assert.ok(problemMatch?.[1], "Saved Problem의 canonical Problem Card 링크를 찾지 못했습니다.");
  result.problem_candidate_id = decodeURIComponent(problemMatch[1]);

  await page.getByRole("link", { name: "보관", exact: true }).click();
  await page.waitForURL((url) => (
    url.pathname === "/problems"
    && url.searchParams.get("status") === "archived"
    && url.searchParams.get("category") === category
  ), { timeout: 30_000 });
  await page.getByText(`선택: ${category}`, { exact: true }).waitFor({ state: "visible" });

  await page.getByRole("link", { name: "활성", exact: true }).click();
  await page.waitForURL((url) => (
    url.pathname === "/problems"
    && url.searchParams.get("status") === null
    && url.searchParams.get("category") === category
  ), { timeout: 30_000 });
  await page.getByText(`선택: ${category}`, { exact: true }).waitFor({ state: "visible" });
  assert.ok(await page.locator("article.saved-problem-card").count() >= 1);
  result.category_archive_verified = true;
}

async function verifyProblemComparison() {
  await page.goto(new URL("/problems/compare", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "문제 카드 비교", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const checkboxes = page.locator('input[name="ids"][type="checkbox"]');
  const count = await checkboxes.count();
  assert.ok(count >= 2, "v0.3 Product QA에는 confirmed Problem Card가 2개 이상 필요합니다.");

  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const value = await checkboxes.nth(index).getAttribute("value");
    if (value) ids.push(value);
  }

  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByRole("button", { name: "선택한 Problem Card 비교" }).click();
  await page.getByRole("heading", { name: "선택한 Problem Card 2개" }).waitFor({ state: "visible", timeout: 30_000 });
  const table = page.getByRole("table");
  for (const metric of ["근거 수", "감정 강도", "반복 패턴", "문제 명확도"]) {
    await table.getByRole("rowheader", { name: metric, exact: true }).waitFor({ state: "visible" });
  }
  result.comparison_verified = true;
  return ids;
}

async function verifyProblemResearchAssets() {
  const id = result.problem_candidate_id;
  assert.ok(id);
  await page.goto(new URL(`/problem-candidates/${id}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  for (const heading of ["Problem Card 관리", "Project 연결", "기존 서비스 / 대안"]) {
    await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  }
  const exportLink = page.getByRole("link", { name: "Markdown 내보내기", exact: true });
  await exportLink.waitFor({ state: "visible" });
  assert.equal(await exportLink.getAttribute("href"), `/api/exports/problem-candidates/${id}`);
  result.problem_assets_verified = true;
}

async function verifyIdeaBoardAndDetail(catalogIds) {
  for (const candidateId of catalogIds) {
    const response = await context.request.get(new URL(`/api/problem-candidates/${candidateId}/ideas`, baseUrl).href);
    assert.equal(response.status(), 200, `Idea discovery API failed for ${candidateId}`);
    const body = await response.json();
    if (Array.isArray(body.ideas) && body.ideas.length > 0) {
      result.idea_candidate_id = body.ideas[0].id;
      break;
    }
  }
  assert.ok(result.idea_candidate_id, "Idea Candidate가 연결된 confirmed Problem Card를 찾지 못했습니다.");

  await page.goto(new URL("/ideas", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Idea Candidate 의사결정 보드" }).waitFor({ state: "visible", timeout: 30_000 });

  await page.goto(new URL(`/idea-candidates/${result.idea_candidate_id}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  const exportLink = page.getByRole("link", { name: "Markdown 내보내기", exact: true });
  await exportLink.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await exportLink.getAttribute("href"), `/api/exports/idea-candidates/${result.idea_candidate_id}`);
  result.idea_board_verified = true;
}

async function verifyResearchProject() {
  for (const pathName of ["/projects", "/projects?status=archived"]) {
    await page.goto(new URL(pathName, baseUrl).href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Research Project \d+개/ }).waitFor({ state: "visible", timeout: 30_000 });
    const links = page.locator('a.research-project-card[href^="/projects/"]');
    if (await links.count() === 0) continue;
    const href = await links.first().getAttribute("href");
    const match = href?.match(/^\/projects\/([^/?#]+)/);
    if (match?.[1]) {
      result.research_project_id = decodeURIComponent(match[1]);
      break;
    }
  }
  assert.ok(result.research_project_id, "Research Project를 찾지 못했습니다.");

  await page.goto(new URL(`/projects/${result.research_project_id}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  const exportLink = page.getByRole("link", { name: "Markdown 내보내기", exact: true });
  await exportLink.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await exportLink.getAttribute("href"), `/api/exports/projects/${result.research_project_id}`);
  result.project_verified = true;
}

async function verifyMarkdownExports() {
  await verifyExport(
    `/api/exports/problem-candidates/${result.problem_candidate_id}`,
    `problem-card-${result.problem_candidate_id}.md`,
    "# Problem Card:",
    "problem-card.md",
  );
  await verifyExport(
    `/api/exports/idea-candidates/${result.idea_candidate_id}`,
    `idea-candidate-${result.idea_candidate_id}.md`,
    "# Idea Candidate:",
    "idea-candidate.md",
  );
  await verifyExport(
    `/api/exports/projects/${result.research_project_id}`,
    `research-project-${result.research_project_id}.md`,
    "# Research Project:",
    "research-project.md",
  );
  result.exports_verified = true;
}

async function verifyExport(apiPath, expectedFilename, requiredPrefix, artifactName) {
  const response = await context.request.get(new URL(apiPath, baseUrl).href);
  assert.equal(response.status(), 200, `${apiPath} failed`);
  assert.match(response.headers()["content-type"] ?? "", /^text\/markdown;\s*charset=utf-8/i);
  assert.equal(response.headers()["content-disposition"], `attachment; filename="${expectedFilename}"`);
  assert.match(response.headers()["cache-control"] ?? "", /private/);
  assert.match(response.headers()["cache-control"] ?? "", /no-store/);
  const body = await response.text();
  assert.ok(body.startsWith(requiredPrefix), `${apiPath} missing ${requiredPrefix}`);
  assert.ok(body.endsWith("\n"));
  await writeFile(path.join(ARTIFACT_DIR, artifactName), body, "utf8");

  const detailPath = apiPath
    .replace("/api/exports/problem-candidates/", "/problem-candidates/")
    .replace("/api/exports/idea-candidates/", "/idea-candidates/")
    .replace("/api/exports/projects/", "/projects/");
  await page.goto(new URL(detailPath, baseUrl).href, { waitUntil: "domcontentloaded" });
  const link = page.getByRole("link", { name: "Markdown 내보내기", exact: true });
  await link.waitFor({ state: "visible", timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    link.click(),
  ]);
  assert.equal(download.suggestedFilename(), expectedFilename);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath);
  assert.equal(await readFile(downloadedPath, "utf8"), body, `${expectedFilename} browser download differs from API bytes`);
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
