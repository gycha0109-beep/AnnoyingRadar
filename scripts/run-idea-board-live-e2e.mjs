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
  process.env.E2E_IDEA_BOARD_ARTIFACT_DIR
    ?? path.join("artifacts", "idea-board-live-e2e", RUN_ID),
);
const REVERSIBLE_TARGET = Object.freeze({
  candidate: "researching",
  researching: "candidate",
  build_soon: "researching",
  paused: "candidate",
  discarded: "candidate",
  archived: "candidate",
});

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
  idea_candidate_id: null,
  project_id: null,
  initial_status: null,
  target_status: null,
  source_discovery_verified: false,
  initial_lane_verified: false,
  drag_status_verified: false,
  reload_persistence_verified: false,
  history_verified: false,
  project_filter_verified: false,
  fallback_restore_verified: false,
  final_state_restored: false,
  started_at: new Date().toISOString(),
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  try {
    if (!baseUrl) throw new Error("E2E_BASE_URL is required. Run this through npm run e2e:idea-board:live.");
    console.log(`Idea Board Live E2E 서버 주소: ${baseUrl}`);

    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    const source = await step("find-safe-board-source", findSafeBoardSource);
    await step("verify-initial-lane", () => verifyInitialLane(source));
    await step("drag-to-reversible-status", () => dragToTargetStatus(source));
    await step("reload-persistence", () => verifyReloadPersistence(source));
    await step("status-history", () => verifyStatusHistory(source));
    await step("project-filter", () => verifyProjectFilter(source));
    await step("fallback-restore", () => restoreWithFallback(source));
    await step("final-state", () => verifyFinalState(source));

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nIdeaBoardLiveE2E: PASS (${source.ideaId}, ${source.initialStatus} -> ${source.targetStatus} -> ${source.initialStatus})`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nIdeaBoardLiveE2E: FAIL");
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

async function findSafeBoardSource() {
  const recentResponse = await context.request.get(new URL("/api/raw-inputs/recent", baseUrl).href);
  if (!recentResponse.ok()) throw new Error(`최근 Raw Input API 조회 실패: HTTP ${recentResponse.status()}`);
  const recentPayload = await recentResponse.json();
  const recentRawInputs = Array.isArray(recentPayload?.raw_inputs) ? recentPayload.raw_inputs : [];

  for (const rawInput of recentRawInputs) {
    if (rawInput?.analysis_status !== "completed" || !String(rawInput?.raw_text ?? "").includes("[AR-E2E:")) continue;

    const candidatesResponse = await context.request.get(
      new URL(`/api/raw-inputs/${rawInput.id}/candidates?include_discarded=1`, baseUrl).href,
    );
    if (!candidatesResponse.ok()) continue;
    const candidatesPayload = await candidatesResponse.json();
    const candidates = Array.isArray(candidatesPayload?.candidates) ? candidatesPayload.candidates : [];

    for (const candidate of candidates.filter((item) => item?.status === "confirmed")) {
      const ideasResponse = await context.request.get(
        new URL(`/api/problem-candidates/${candidate.id}/ideas`, baseUrl).href,
      );
      if (!ideasResponse.ok()) continue;
      const ideasPayload = await ideasResponse.json();
      const ideas = Array.isArray(ideasPayload?.ideas) ? ideasPayload.ideas : [];

      for (const idea of ideas) {
        const targetStatus = REVERSIBLE_TARGET[idea?.status];
        if (!idea?.id || !idea?.title || !targetStatus) continue;

        const projectsResponse = await context.request.get(
          new URL(`/api/idea-candidates/${idea.id}/projects`, baseUrl).href,
        );
        if (!projectsResponse.ok()) continue;
        const projectsPayload = await projectsResponse.json();
        const memberships = Array.isArray(projectsPayload?.memberships) ? projectsPayload.memberships : [];
        const membership = memberships.find((item) => item?.project?.id && item?.project?.title);
        if (!membership) continue;

        result.idea_candidate_id = idea.id;
        result.project_id = membership.project.id;
        result.initial_status = idea.status;
        result.target_status = targetStatus;
        result.source_discovery_verified = true;

        return {
          rawInputId: rawInput.id,
          problemCandidateId: candidate.id,
          ideaId: idea.id,
          ideaTitle: idea.title,
          initialStatus: idea.status,
          targetStatus,
          projectId: membership.project.id,
          projectTitle: membership.project.title,
        };
      }
    }
  }

  throw new Error(
    "최근 [AR-E2E:] 완료 source에서 Research Project에 연결된 Idea Candidate를 찾지 못했습니다. "
      + "Phase 9 Research Project Live E2E fixture가 필요합니다.",
  );
}

async function verifyInitialLane(source) {
  await openBoard();
  const lane = laneFor(source.initialStatus);
  await lane.waitFor({ state: "visible", timeout: 30_000 });
  await cardInLane(lane, source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  result.initial_lane_verified = true;
}

async function dragToTargetStatus(source) {
  const fromLane = laneFor(source.initialStatus);
  const targetLane = laneFor(source.targetStatus);
  const card = cardInLane(fromLane, source.ideaTitle);
  await card.dragTo(targetLane);

  await page.getByText(`${source.ideaTitle} → ${statusLabel(source.targetStatus)} 이동을 저장했습니다.`, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await cardInLane(targetLane, source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  await assertIdeaStatus(source.ideaId, source.targetStatus);
  result.drag_status_verified = true;
}

async function verifyReloadPersistence(source) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Idea Candidate 의사결정 보드" }).waitFor({ state: "visible", timeout: 30_000 });
  await cardInLane(laneFor(source.targetStatus), source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  result.reload_persistence_verified = true;
}

async function verifyStatusHistory(source) {
  await page.goto(new URL(`/idea-candidates/${source.ideaId}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "상태 변경 이력" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText(`${source.initialStatus} → ${source.targetStatus}`, { exact: true }).last().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  result.history_verified = true;
}

async function verifyProjectFilter(source) {
  await page.goto(new URL(`/ideas?project=${encodeURIComponent(source.projectId)}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Idea Candidate 의사결정 보드" }).waitFor({ state: "visible", timeout: 30_000 });
  const projectSelect = page.getByRole("combobox", { name: "Project 기준으로 보기" });
  assert.equal(await projectSelect.inputValue(), source.projectId);
  await page.getByText(`Project: ${source.projectTitle}`, { exact: true }).waitFor({ state: "visible" });
  await cardInLane(laneFor(source.targetStatus), source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  result.project_filter_verified = true;
}

async function restoreWithFallback(source) {
  const lane = laneFor(source.targetStatus);
  const card = cardInLane(lane, source.ideaTitle);
  const moveSelect = card.getByRole("combobox", { name: `${source.ideaTitle} 상태 이동` });
  await moveSelect.selectOption(source.initialStatus);
  await page.getByText(`${source.ideaTitle} → ${statusLabel(source.initialStatus)} 이동을 저장했습니다.`, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await cardInLane(laneFor(source.initialStatus), source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  await assertIdeaStatus(source.ideaId, source.initialStatus);
  result.fallback_restore_verified = true;
}

async function verifyFinalState(source) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Idea Candidate 의사결정 보드" }).waitFor({ state: "visible", timeout: 30_000 });
  await cardInLane(laneFor(source.initialStatus), source.ideaTitle).waitFor({ state: "visible", timeout: 30_000 });
  await assertIdeaStatus(source.ideaId, source.initialStatus);
  result.final_state_restored = true;
}

async function openBoard() {
  await page.goto(new URL("/ideas", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Idea Candidate 의사결정 보드" }).waitFor({ state: "visible", timeout: 30_000 });
}

function laneFor(status) {
  return page.locator(`section.idea-board-lane[data-status="${status}"]`);
}

function cardInLane(lane, title) {
  return lane.locator("article.idea-board-card").filter({ hasText: title }).first();
}

async function assertIdeaStatus(ideaId, expectedStatus) {
  const response = await context.request.get(new URL(`/api/idea-candidates/${ideaId}`, baseUrl).href);
  if (!response.ok()) throw new Error(`Idea detail API 조회 실패: HTTP ${response.status()}`);
  const payload = await response.json();
  assert.equal(payload?.idea?.status, expectedStatus);
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
    // Screenshots are diagnostics only.
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
  const url = new URL(value);
  return url.href.replace(/\/$/, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function statusLabel(status) {
  return {
    candidate: "Candidate",
    researching: "Researching",
    build_soon: "Build Soon",
    paused: "Paused",
    discarded: "Discarded",
    archived: "Archived",
  }[status] ?? status;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}
