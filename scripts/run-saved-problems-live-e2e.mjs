import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const MARKER = `[AR-SAVED-E2E:${RUN_ID}]`;
const CATEGORY = `E2E-${RUN_ID.slice(0, 19)}`;
const MEMO = `${MARKER} Saved Problem persistence verification`;
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_SAVED_PROBLEM_ARTIFACT_DIR
    ?? path.join("artifacts", "saved-problems-live-e2e", RUN_ID),
);

let baseUrl;
let browser;
let context;
let page;
let serverProcess;
let traceStarted = false;
let stepIndex = 0;
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const result = {
  run_id: RUN_ID,
  marker: MARKER,
  base_url: null,
  problem_card_path: null,
  test_source_verified: false,
  saved_problem_category: CATEGORY,
  saved_problem_memo_verified: false,
  saved_problem_library_reentry_verified: false,
  saved_problem_archive_verified: false,
  saved_problem_restore_verified: false,
  started_at: new Date().toISOString(),
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  try {
    assertProjectRoot();
    const loadedEnvFiles = loadProjectEnvironment();
    assertManagedEnvironment();
    baseUrl = normalizeBaseUrl(process.env.E2E_BASE_URL ?? await allocateLoopbackBaseUrl());
    result.base_url = baseUrl;
    if (loadedEnvFiles.length > 0) console.log(`로드한 환경 파일: ${loadedEnvFiles.join(", ")}`);
    console.log(`Saved Problem Live E2E 서버 주소: ${baseUrl}`);

    await ensureApplicationServer();
    const chromium = await loadChromium();
    browser = await launchBrowser(chromium);
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    const problemCardPath = await step("find-completed-problem-card", findCompletedProblemCard);
    result.problem_card_path = problemCardPath;
    await step("save-problem-card", () => saveProblemCard(problemCardPath));
    await step("saved-problem-metadata-edit", editSavedProblemMetadata);
    await step("saved-problems-reentry", () => verifySavedProblemsReentry(problemCardPath));
    await step("saved-problem-archive", () => archiveSavedProblem(problemCardPath));
    await step("saved-problem-restore-persistence", () => restoreSavedProblem(problemCardPath));

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nSavedProblemsLiveE2E: PASS (${problemCardPath})`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nSavedProblemsLiveE2E: FAIL");
    console.error(result.error);
    await safeScreenshot("failure.png");
    process.exitCode = 1;
  } finally {
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
    stopApplicationServer();
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
        const url = new URL(page.url());
        return url.origin === new URL(baseUrl).origin
          && url.pathname === "/"
          && await isVisible(page.getByRole("button", { name: "로그아웃" }));
      },
      LOGIN_TIMEOUT_MS,
      "로그인 완료",
    );
  }

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "로그아웃" }).waitFor({ state: "visible" });
}

async function findCompletedProblemCard() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "최근 입력 3개" }).waitFor({ state: "visible" });
  const recentItems = page.locator("a.recent-item");
  await recentItems.first().waitFor({ state: "visible", timeout: 30_000 });
  const recentEntries = await recentItems.evaluateAll((items) => items.map((item) => ({
    text: (item.textContent ?? "").replace(/\s+/g, " "),
    href: item.getAttribute("href"),
  })));

  for (const entry of recentEntries) {
    const rawPath = entry.href;
    if (!rawPath || !entry.text.includes("[AR-E2E:")) continue;

    await page.goto(new URL(rawPath, baseUrl).href, { waitUntil: "domcontentloaded" });
    const section = page.locator('section[aria-labelledby="candidate-grouping-title"]');
    if (!(await isVisible(section))) continue;
    const statuses = (await section.locator(".status-badge").allTextContents())
      .map((text) => text.trim());
    if (!statuses.includes("completed")) continue;

    const cardLinks = section.getByRole("link", { name: "Problem Card 상세" });
    const cardCount = await cardLinks.count();
    for (let cardIndex = 0; cardIndex < cardCount; cardIndex += 1) {
      const problemCardPath = await cardLinks.nth(cardIndex).getAttribute("href");
      if (!problemCardPath) continue;

      await page.goto(new URL(problemCardPath, baseUrl).href, { waitUntil: "domcontentloaded" });
      const savedSection = page.locator('section[aria-labelledby="saved-problem-title"]');
      if (!(await isVisible(savedSection))) continue;
      const sourceState = await poll(
        async () => {
          if (await isEnabledVisible(savedSection.getByRole("button", { name: "Problem Card 저장" }))) {
            return "unsaved";
          }
          if (await isVisible(savedSection.getByRole("textbox", { name: "카테고리" }))) {
            return "already_saved";
          }
          return false;
        },
        30_000,
        "Saved Problem source state",
      );

      if (sourceState === "unsaved") {
        result.test_source_verified = true;
        return problemCardPath;
      }

      await page.goto(new URL(rawPath, baseUrl).href, { waitUntil: "domcontentloaded" });
    }
  }

  throw new Error(
    "최근 입력 3개에서 아직 저장되지 않은 Phase 7 E2E completed Problem Card를 찾지 못했습니다. "
      + "사용자 Saved Problem을 덮어쓰지 않기 위해 기존 저장 카드는 사용하지 않습니다. "
      + "먼저 npm run e2e:live를 실행해 새 E2E completed Problem Card를 만든 뒤 다시 실행하십시오.",
  );
}

async function saveProblemCard(problemCardPath) {
  await page.goto(new URL(problemCardPath, baseUrl).href, { waitUntil: "domcontentloaded" });
  const section = page.locator('section[aria-labelledby="saved-problem-title"]');
  await section.waitFor({ state: "visible", timeout: 30_000 });

  const save = section.getByRole("button", { name: "Problem Card 저장" });
  await poll(() => isEnabledVisible(save), 30_000, "Problem Card 저장 버튼 활성화");
  await save.click();
  await section.getByText("Problem Card를 Saved Problems에 저장했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await section.getByRole("textbox", { name: "카테고리" }).waitFor({ state: "visible" });
  await section.getByText("active", { exact: true }).first().waitFor({ state: "visible" });
}

async function editSavedProblemMetadata() {
  const section = page.locator('section[aria-labelledby="saved-problem-title"]');
  const category = section.getByRole("textbox", { name: "카테고리" });
  const memo = section.getByRole("textbox", { name: "메모" });
  await category.fill(CATEGORY);
  await memo.fill(MEMO);
  await section.getByRole("button", { name: "Saved Problem 메타데이터 저장" }).click();
  await section.getByText("Saved Problem 메타데이터를 저장했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  assert.equal(await category.inputValue(), CATEGORY);
  assert.equal(await memo.inputValue(), MEMO);
  result.saved_problem_memo_verified = true;
}

async function verifySavedProblemsReentry(problemCardPath) {
  await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "확정한 Problem Card를 다시 꺼내는 라이브러리" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const item = page.locator("article.saved-problem-card")
    .filter({ hasText: CATEGORY })
    .filter({ hasText: MEMO })
    .first();
  await item.waitFor({ state: "visible", timeout: 30_000 });
  const detail = item.locator(`a[href="${problemCardPath}#saved-problem"]`);
  await detail.waitFor({ state: "visible" });
  await detail.click();
  await page.waitForURL((url) => url.pathname === problemCardPath, { timeout: 30_000 });

  const section = page.locator('section[aria-labelledby="saved-problem-title"]');
  assert.equal(await section.getByRole("textbox", { name: "카테고리" }).inputValue(), CATEGORY);
  assert.equal(await section.getByRole("textbox", { name: "메모" }).inputValue(), MEMO);
  result.saved_problem_library_reentry_verified = true;
}

async function archiveSavedProblem(problemCardPath) {
  await page.goto(new URL(problemCardPath, baseUrl).href, { waitUntil: "domcontentloaded" });
  const section = page.locator('section[aria-labelledby="saved-problem-title"]');
  const archive = section.getByRole("button", { name: "Saved Problem 보관" });
  await archive.waitFor({ state: "visible", timeout: 30_000 });
  await archive.click();
  await section.getByText("Saved Problem을 보관했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await section.getByText("archived", { exact: true }).first().waitFor({ state: "visible" });

  await page.goto(new URL("/problems?status=archived", baseUrl).href, { waitUntil: "domcontentloaded" });
  const item = page.locator("article.saved-problem-card")
    .filter({ hasText: CATEGORY })
    .filter({ hasText: MEMO })
    .first();
  await item.waitFor({ state: "visible", timeout: 30_000 });
  await item.getByText("archived", { exact: true }).waitFor({ state: "visible" });
  result.saved_problem_archive_verified = true;
}

async function restoreSavedProblem(problemCardPath) {
  const item = page.locator("article.saved-problem-card")
    .filter({ hasText: CATEGORY })
    .filter({ hasText: MEMO })
    .first();
  const detail = item.locator(`a[href="${problemCardPath}#saved-problem"]`);
  await detail.click();
  await page.waitForURL((url) => url.pathname === problemCardPath, { timeout: 30_000 });

  const section = page.locator('section[aria-labelledby="saved-problem-title"]');
  await section.getByRole("button", { name: "Saved Problem 복구" }).click();
  await section.getByText("Saved Problem을 복구했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await section.getByText("active", { exact: true }).first().waitFor({ state: "visible" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await section.getByText("active", { exact: true }).first().waitFor({ state: "visible" });
  assert.equal(await section.getByRole("textbox", { name: "카테고리" }).inputValue(), CATEGORY);
  assert.equal(await section.getByRole("textbox", { name: "메모" }).inputValue(), MEMO);

  await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
  const activeItem = page.locator("article.saved-problem-card")
    .filter({ hasText: CATEGORY })
    .filter({ hasText: MEMO })
    .first();
  await activeItem.waitFor({ state: "visible", timeout: 30_000 });
  await activeItem.getByText("active", { exact: true }).waitFor({ state: "visible" });
  result.saved_problem_restore_verified = true;
}

async function step(name, operation) {
  stepIndex += 1;
  const prefix = String(stepIndex).padStart(2, "0");
  console.log(`\n[${prefix}] ${name}`);
  try {
    const value = await operation();
    await safeScreenshot(`${prefix}-${slug(name)}.png`);
    return value;
  } catch (error) {
    await safeScreenshot(`${prefix}-${slug(name)}-failed.png`);
    throw error;
  }
}

function assertProjectRoot() {
  for (const requiredPath of ["package.json", path.join("scripts", "run-saved-problems-live-e2e.mjs")]) {
    const absolutePath = path.join(PROJECT_ROOT, requiredPath);
    if (!existsSync(absolutePath)) {
      throw new Error(`AnnoyingRadar 프로젝트 파일을 찾을 수 없습니다: ${absolutePath}`);
    }
  }
}

function loadProjectEnvironment() {
  const candidates = [".env.development.local", ".env.local", ".env.development", ".env"];
  const loaded = [];
  for (const filename of candidates) {
    const envPath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(envPath)) continue;
    process.loadEnvFile(envPath);
    loaded.push(filename);
  }
  return loaded;
}

function assertManagedEnvironment() {
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  if (!(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (missing.length > 0) {
    throw new Error(`Saved Problem Live E2E에 필요한 환경변수가 없습니다: ${missing.join(", ")}`);
  }
}

async function allocateLoopbackBaseUrl() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Saved Problem Live E2E용 loopback port를 할당하지 못했습니다.");
  }
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return `http://127.0.0.1:${address.port}`;
}

async function ensureApplicationServer() {
  if (await serverAvailable()) return;
  const url = new URL(baseUrl);
  if (!isLoopback(url.hostname)) throw new Error(`E2E_BASE_URL에 연결할 수 없습니다: ${baseUrl}`);

  const args = ["run", "dev", "--", "--hostname", url.hostname, "--port", url.port || "3000"];
  const command = resolvePackageManagerCommand(args);
  const logPath = path.join(ARTIFACT_DIR, "dev-server.log");
  serverProcess = spawn(command.file, command.args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: command.shell,
  });
  serverProcess.stdout.on("data", (chunk) => void appendFile(logPath, chunk));
  serverProcess.stderr.on("data", (chunk) => void appendFile(logPath, chunk));
  await waitForApplicationServer(command.label);
}

function resolvePackageManagerCommand(args) {
  const packageManagerEntrypoint = process.env.npm_execpath;
  if (packageManagerEntrypoint && existsSync(packageManagerEntrypoint)) {
    return {
      file: process.execPath,
      args: [packageManagerEntrypoint, ...args],
      shell: false,
      label: `${process.execPath} ${packageManagerEntrypoint}`,
    };
  }
  const packageManager = existsSync(path.join(PROJECT_ROOT, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(path.join(PROJECT_ROOT, "yarn.lock"))
      ? "yarn"
      : "npm";
  return {
    file: packageManager,
    args,
    shell: process.platform === "win32",
    label: packageManager,
  };
}

async function waitForApplicationServer(commandLabel) {
  const earlyExit = new Promise((_, reject) => {
    serverProcess.once("error", (error) => reject(
      new Error(`개발 서버를 시작하지 못했습니다 (${commandLabel}): ${errorMessage(error)}`),
    ));
    serverProcess.once("exit", (code, signal) => reject(
      new Error(`개발 서버가 준비 전에 종료되었습니다 (${commandLabel}, code=${code}, signal=${signal ?? "none"}).`),
    ));
  });
  await Promise.race([
    poll(serverAvailable, 90_000, "Next.js 개발 서버 시작"),
    earlyExit,
  ]);
}

async function serverAvailable() {
  try {
    const response = await fetch(baseUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(2_000),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

function stopApplicationServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    serverProcess.kill("SIGTERM");
  }
}

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (error) {
    throw new Error(`Playwright 패키지가 없습니다. 먼저 npm install을 실행하십시오. (${errorMessage(error)})`);
  }
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ headless: false, slowMo: 60 });
  } catch (error) {
    if (!/Executable doesn't exist|browser executable|playwright install/i.test(errorMessage(error))) throw error;
    console.log("Chromium이 없어 자동 설치합니다.");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const installed = spawnSync(npx, ["playwright", "install", "chromium"], { stdio: "inherit" });
    if (installed.status !== 0) throw new Error("Playwright Chromium 자동 설치에 실패했습니다.");
    return chromium.launch({ headless: false, slowMo: 60 });
  }
}

function bindDiagnostics(targetPage) {
  targetPage.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text(), at: new Date().toISOString() });
  });
  targetPage.on("pageerror", (error) => {
    pageErrors.push({ message: error.message, stack: error.stack ?? null, at: new Date().toISOString() });
  });
  targetPage.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
      at: new Date().toISOString(),
    });
  });
}

async function persistDiagnostics() {
  await Promise.all([
    writeFile(path.join(ARTIFACT_DIR, "result.json"), JSON.stringify(result, null, 2)),
    writeFile(path.join(ARTIFACT_DIR, "browser-console.json"), JSON.stringify(consoleMessages, null, 2)),
    writeFile(path.join(ARTIFACT_DIR, "page-errors.json"), JSON.stringify(pageErrors, null, 2)),
    writeFile(path.join(ARTIFACT_DIR, "request-failures.json"), JSON.stringify(requestFailures, null, 2)),
  ]).catch((error) => console.error(`진단 파일 저장 실패: ${errorMessage(error)}`));
}

async function safeScreenshot(filename) {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: path.join(ARTIFACT_DIR, filename), fullPage: true });
  } catch (error) {
    console.error(`스크린샷 저장 실패: ${errorMessage(error)}`);
  }
}

async function poll(operation, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`${label} 시간 초과${lastError ? `: ${errorMessage(lastError)}` : ""}`);
}

async function isVisible(locator) {
  return await locator.count() > 0 && locator.first().isVisible().catch(() => false);
}

async function isEnabledVisible(locator) {
  return await isVisible(locator) && locator.first().isEnabled().catch(() => false);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.href.replace(/\/$/, "");
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
