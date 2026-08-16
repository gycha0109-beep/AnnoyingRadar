import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const MARKER = `[AR-P9-E2E:${RUN_ID}]`;
const PROJECT_TITLE = `${MARKER} Research Project`;
const PROJECT_PURPOSE = `${MARKER} persistence and explicit membership verification`;
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_RESEARCH_PROJECT_ARTIFACT_DIR
    ?? path.join("artifacts", "research-projects-live-e2e", RUN_ID),
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
  test_source_raw_input_id: null,
  test_problem_candidate_id: null,
  test_idea_candidate_id: null,
  research_project_id: null,
  source_discovery_verified: false,
  project_create_link_verified: false,
  project_detail_reentry_verified: false,
  project_metadata_verified: false,
  idea_link_verified: false,
  idea_unlink_relink_verified: false,
  project_archive_verified: false,
  project_restore_persistence_verified: false,
  final_fixture_archive_verified: false,
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
    if (loadedEnvFiles.length) console.log(`로드한 환경 파일: ${loadedEnvFiles.join(", ")}`);
    console.log(`Research Project Live E2E 서버 주소: ${baseUrl}`);

    await ensureApplicationServer();
    const chromium = await loadChromium();
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    const source = await step("find-safe-project-source", findSafeProjectSource);
    await step("create-research-project", () => createResearchProjectFromSavedProblem(source));
    await step("project-detail-reentry", () => verifyProjectDetail(source));
    await step("project-metadata-edit", editProjectMetadata);
    await step("link-existing-idea", () => linkIdea(source));
    await step("unlink-relink-idea", () => unlinkRelinkIdea(source));
    await step("project-archive", archiveProject);
    await step("project-restore-persistence", () => restoreProjectAndVerifyPersistence(source));
    await step("final-fixture-archive", archiveFixtureProject);

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nResearchProjectsLiveE2E: PASS (${result.research_project_id})`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nResearchProjectsLiveE2E: FAIL");
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

async function findSafeProjectSource() {
  const recentResponse = await context.request.get(new URL("/api/raw-inputs/recent", baseUrl).href);
  if (!recentResponse.ok()) {
    throw new Error(`최근 Raw Input API 조회 실패: HTTP ${recentResponse.status()}`);
  }

  const recentPayload = await recentResponse.json();
  const recentRawInputs = Array.isArray(recentPayload?.raw_inputs) ? recentPayload.raw_inputs : [];

  for (const rawInput of recentRawInputs) {
    if (
      rawInput?.analysis_status !== "completed"
      || !String(rawInput?.raw_text ?? "").includes("[AR-E2E:")
    ) {
      continue;
    }

    const candidatesResponse = await context.request.get(
      new URL(`/api/raw-inputs/${rawInput.id}/candidates?include_discarded=1`, baseUrl).href,
    );
    if (!candidatesResponse.ok()) continue;
    const candidatesPayload = await candidatesResponse.json();
    const candidates = Array.isArray(candidatesPayload?.candidates) ? candidatesPayload.candidates : [];

    for (const candidate of candidates.filter((item) => item?.status === "confirmed")) {
      const saveResponse = await context.request.get(
        new URL(`/api/problem-candidates/${candidate.id}/save`, baseUrl).href,
      );
      if (!saveResponse.ok()) continue;
      const savePayload = await saveResponse.json();
      if (savePayload?.saved_problem?.status !== "active") continue;

      const ideasResponse = await context.request.get(
        new URL(`/api/problem-candidates/${candidate.id}/ideas`, baseUrl).href,
      );
      if (!ideasResponse.ok()) continue;
      const ideasPayload = await ideasResponse.json();
      const ideas = Array.isArray(ideasPayload?.ideas) ? ideasPayload.ideas : [];
      const idea = ideas.find((item) => item?.id && item?.title);
      if (!idea) continue;

      result.test_source_raw_input_id = rawInput.id;
      result.test_problem_candidate_id = candidate.id;
      result.test_idea_candidate_id = idea.id;
      result.source_discovery_verified = true;

      return {
        rawInputId: rawInput.id,
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        ideaId: idea.id,
        ideaTitle: idea.title,
      };
    }
  }

  throw new Error(
    "최근 입력 3개에서 active Saved Problem + Idea Candidate를 가진 Phase 7 E2E source를 찾지 못했습니다. "
      + "기존 사용자 자산을 수정하지 않기 위해 [AR-E2E:] source만 사용합니다. "
      + "필요하면 npm run e2e:live 후 npm run e2e:saved-problems:live를 실행해 안전한 source를 준비하십시오.",
  );
}

async function createResearchProjectFromSavedProblem(source) {
  await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "확정한 Problem Card를 다시 꺼내는 라이브러리" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const item = page.locator("article.saved-problem-card")
    .filter({ hasText: source.candidateTitle })
    .first();
  await item.waitFor({ state: "visible", timeout: 30_000 });
  const titleInput = item.getByPlaceholder("새 Project 이름");
  await titleInput.fill(PROJECT_TITLE);
  await item.getByRole("button", { name: "새 Project 생성·연결" }).click();
  await item.getByText("새 Research Project를 만들고 Saved Problem을 연결했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const membershipsResponse = await context.request.get(
    new URL(`/api/problem-candidates/${source.candidateId}/projects`, baseUrl).href,
  );
  if (!membershipsResponse.ok()) {
    throw new Error(`Problem Project membership API 조회 실패: HTTP ${membershipsResponse.status()}`);
  }
  const membershipsPayload = await membershipsResponse.json();
  const membership = (Array.isArray(membershipsPayload?.memberships) ? membershipsPayload.memberships : [])
    .find((entry) => entry?.project?.title === PROJECT_TITLE);
  assert.ok(membership?.project_id, "새 Research Project membership을 API에서 찾을 수 없습니다.");

  result.research_project_id = membership.project_id;
  result.project_create_link_verified = true;
}

async function verifyProjectDetail(source) {
  const projectPath = `/projects/${result.research_project_id}`;
  await page.goto(new URL(projectPath, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: PROJECT_TITLE }).waitFor({ state: "visible", timeout: 30_000 });

  const problemsSection = page.locator('section[aria-labelledby="project-problems-title"]');
  await problemsSection.waitFor({ state: "visible", timeout: 30_000 });
  await problemsSection.getByText(source.candidateTitle, { exact: true }).first().waitFor({ state: "visible" });
  result.project_detail_reentry_verified = true;
}

async function editProjectMetadata() {
  const purpose = page.getByRole("textbox", { name: "조사 목적" });
  await purpose.fill(PROJECT_PURPOSE);
  await page.getByRole("button", { name: "Project 정보 저장" }).click();
  await page.getByText("Research Project 정보를 저장했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  assert.equal(await purpose.inputValue(), PROJECT_PURPOSE);
  result.project_metadata_verified = true;
}

async function linkIdea(source) {
  const ideasSection = page.locator('section[aria-labelledby="project-ideas-title"]');
  const select = ideasSection.locator("select");
  await select.selectOption(source.ideaId);
  await ideasSection.getByRole("button", { name: "Idea 연결" }).click();
  await page.getByText("Idea Candidate를 Research Project에 연결했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await ideasSection.getByText(source.ideaTitle, { exact: true }).first().waitFor({ state: "visible" });
  result.idea_link_verified = true;
}

async function unlinkRelinkIdea(source) {
  const ideasSection = page.locator('section[aria-labelledby="project-ideas-title"]');
  const item = ideasSection.locator("article.research-project-asset")
    .filter({ hasText: source.ideaTitle })
    .first();
  await item.getByRole("button", { name: "연결 해제" }).click();
  await page.getByText("Idea Candidate 연결을 해제했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const select = ideasSection.locator("select");
  await poll(async () => (await select.locator(`option[value="${source.ideaId}"]`).count()) === 1, 30_000, "Idea relink option");
  await select.selectOption(source.ideaId);
  await ideasSection.getByRole("button", { name: "Idea 연결" }).click();
  await page.getByText("Idea Candidate를 Research Project에 연결했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await ideasSection.getByText(source.ideaTitle, { exact: true }).first().waitFor({ state: "visible" });
  result.idea_unlink_relink_verified = true;
}

async function archiveProject() {
  await page.getByRole("button", { name: "Project 보관" }).click();
  await page.getByText("Research Project를 보관했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByText("archived", { exact: true }).first().waitFor({ state: "visible" });

  await page.goto(new URL("/projects?status=archived", baseUrl).href, { waitUntil: "domcontentloaded" });
  const projectCard = page.locator("a.research-project-card").filter({ hasText: PROJECT_TITLE }).first();
  await projectCard.waitFor({ state: "visible", timeout: 30_000 });
  await projectCard.click();
  await page.waitForURL((url) => url.pathname === `/projects/${result.research_project_id}`, { timeout: 30_000 });
  await page.getByText("보관된 Project는 조회만 가능합니다. 연결이나 메타데이터를 바꾸려면 먼저 복구하십시오.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  result.project_archive_verified = true;
}

async function restoreProjectAndVerifyPersistence(source) {
  await page.getByRole("button", { name: "Project 복구" }).click();
  await page.getByText("Research Project를 복구했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("active", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await page.getByRole("textbox", { name: "조사 목적" }).inputValue(), PROJECT_PURPOSE);

  const problemsSection = page.locator('section[aria-labelledby="project-problems-title"]');
  const ideasSection = page.locator('section[aria-labelledby="project-ideas-title"]');
  await problemsSection.getByText(source.candidateTitle, { exact: true }).first().waitFor({ state: "visible" });
  await ideasSection.getByText(source.ideaTitle, { exact: true }).first().waitFor({ state: "visible" });
  result.project_restore_persistence_verified = true;
}

async function archiveFixtureProject() {
  await page.getByRole("button", { name: "Project 보관" }).click();
  await page.getByText("Research Project를 보관했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByText("archived", { exact: true }).first().waitFor({ state: "visible" });
  result.final_fixture_archive_verified = true;
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
  for (const requiredPath of ["package.json", path.join("scripts", "run-research-projects-live-e2e.mjs")]) {
    const absolutePath = path.join(PROJECT_ROOT, requiredPath);
    if (!existsSync(absolutePath)) {
      throw new Error(`AnnoyingRadar 프로젝트 파일을 찾을 수 없습니다: ${absolutePath}`);
    }
  }
}

function loadProjectEnvironment() {
  const files = [".env", ".env.development", ".env.local", ".env.development.local"];
  const managed = new Set([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const loaded = [];

  for (const filename of files) {
    const envPath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(envPath)) continue;
    const parsed = parseEnv(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (managed.has(key) || process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(filename);
  }
  return loaded;
}

function assertManagedEnvironment() {
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  if (!(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (missing.length) throw new Error(`Live E2E 환경변수가 없습니다: ${missing.join(", ")}`);
}

async function allocateLoopbackBaseUrl() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("임시 E2E 포트를 할당하지 못했습니다.");
  return `http://127.0.0.1:${address.port}`;
}

async function ensureApplicationServer() {
  if (await serverAvailable()) return;
  const url = new URL(baseUrl);
  if (!isLoopback(url.hostname)) throw new Error(`E2E_BASE_URL에 연결할 수 없습니다: ${baseUrl}`);

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev", "--", "--hostname", url.hostname, "--port", url.port || "3000"];
  const logPath = path.join(ARTIFACT_DIR, "dev-server.log");
  serverProcess = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  serverProcess.stdout.on("data", (chunk) => void appendFile(logPath, chunk).catch(() => {}));
  serverProcess.stderr.on("data", (chunk) => void appendFile(logPath, chunk).catch(() => {}));
  serverProcess.once("error", (error) => console.error(`Dev server spawn error: ${errorMessage(error)}`));

  await poll(serverAvailable, 60_000, "Next.js dev server");
}

async function serverAvailable() {
  try {
    const response = await fetch(baseUrl, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

function stopApplicationServer() {
  if (!serverProcess?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-serverProcess.pid, "SIGTERM");
    }
  } catch {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      // Best-effort cleanup only.
    }
  }
}

async function loadChromium() {
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch (error) {
    throw new Error(`Playwright를 불러오지 못했습니다: ${errorMessage(error)}`);
  }
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
    // Screenshots are diagnostic only.
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
  const url = new URL(value);
  if (!url.port && isLoopback(url.hostname)) url.port = "3000";
  return url.href.replace(/\/$/, "");
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
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
