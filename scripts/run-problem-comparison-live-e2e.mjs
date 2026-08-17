import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_PROBLEM_COMPARISON_ARTIFACT_DIR
    ?? path.join("artifacts", "problem-comparison-live-e2e", RUN_ID),
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
  selected_problem_candidate_ids: [],
  catalog_verified: false,
  selection_verified: false,
  comparison_table_verified: false,
  reload_verified: false,
  return_to_catalog_verified: false,
  browser_page_error_count: 0,
  hydration_error_count: 0,
  started_at: new Date().toISOString(),
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  try {
    if (!baseUrl) {
      throw new Error("E2E_BASE_URL is required. Run this through npm run e2e:problem-comparison:live.");
    }
    console.log(`Problem Comparison Live E2E 서버 주소: ${baseUrl}`);

    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    await step("open-comparison-catalog", openComparisonCatalog);
    await step("select-two-problem-cards", selectTwoProblemCards);
    await step("verify-comparison-table", verifyComparisonTable);
    await step("reload-persistence", verifyReloadPersistence);
    await step("return-to-catalog", returnToCatalog);
    assertDiagnosticsClean();

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nProblemComparisonLiveE2E: PASS (${result.selected_problem_candidate_ids.join(", ")})`);
    console.log(`ProblemComparisonLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nProblemComparisonLiveE2E: FAIL");
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

async function openComparisonCatalog() {
  await page.goto(new URL("/problems/compare", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "문제 카드 비교", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("heading", { name: /비교 가능한 confirmed Problem Card \d+개/ }).waitFor({ state: "visible" });
  const checkboxes = page.locator('input[name="ids"][type="checkbox"]');
  assert.ok(await checkboxes.count() >= 2, "비교 가능한 confirmed Problem Card가 2개 미만입니다.");
  result.catalog_verified = true;
}

async function selectTwoProblemCards() {
  const checkboxes = page.locator('input[name="ids"][type="checkbox"]');
  const first = checkboxes.nth(0);
  const second = checkboxes.nth(1);
  await first.check();
  await second.check();

  const firstId = await first.getAttribute("value");
  const secondId = await second.getAttribute("value");
  assert.ok(firstId && secondId && firstId !== secondId);
  result.selected_problem_candidate_ids = [firstId, secondId];

  await page.getByRole("button", { name: "선택한 Problem Card 비교" }).click();
  await page.waitForURL((url) => {
    const ids = url.searchParams.getAll("ids");
    return url.pathname === "/problems/compare" && ids.length === 2;
  }, { timeout: 30_000 });
  result.selection_verified = true;
}

async function verifyComparisonTable() {
  await page.getByRole("heading", { name: "선택한 Problem Card 2개" }).waitFor({ state: "visible", timeout: 30_000 });
  const table = page.getByRole("table");
  await table.waitFor({ state: "visible" });
  for (const metric of ["요약", "대상 사용자", "상황", "근거 수", "감정 강도", "반복 패턴", "문제 명확도"] ) {
    await table.getByRole("rowheader", { name: metric, exact: true }).waitFor({ state: "visible" });
  }
  assert.ok(await table.getByRole("link", { name: "상세 열기" }).count() >= 2);
  result.comparison_table_verified = true;
}

async function verifyReloadPersistence() {
  const before = new URL(page.url()).search;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "선택한 Problem Card 2개" }).waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(new URL(page.url()).search, before);
  result.reload_verified = true;
}

async function returnToCatalog() {
  await page.getByRole("link", { name: "선택 다시 하기" }).click();
  await page.waitForURL((url) => url.pathname === "/problems/compare" && !url.search, { timeout: 30_000 });
  await page.getByRole("heading", { name: /비교 가능한 confirmed Problem Card \d+개/ }).waitFor({ state: "visible" });
  result.return_to_catalog_verified = true;
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
