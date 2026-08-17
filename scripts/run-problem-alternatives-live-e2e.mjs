import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const MARKER = `[AR-ALT-E2E:${RUN_ID}]`;
const CREATE_NAME = `${MARKER} service`;
const UPDATED_NAME = `${MARKER} alternative`;
const TEST_URL = "https://example.com/annoying-radar-e2e";
const CREATE_NOTE = `${MARKER} initial competitor note`;
const UPDATED_NOTE = `${MARKER} updated workaround note`;
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_PROBLEM_ALTERNATIVES_ARTIFACT_DIR
    ?? path.join("artifacts", "problem-alternatives-live-e2e", RUN_ID),
);

const baseUrl = normalizeBaseUrl(process.env.E2E_BASE_URL);
let browser;
let context;
let page;
let traceStarted = false;
let stepIndex = 0;
let candidateId = null;
let createdNoteId = null;
let initialCount = null;
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const result = {
  run_id: RUN_ID,
  marker: MARKER,
  base_url: baseUrl,
  problem_candidate_id: null,
  created_note_id: null,
  initial_note_count: null,
  final_note_count: null,
  catalog_source_verified: false,
  create_verified: false,
  reload_verified: false,
  update_verified: false,
  delete_verified: false,
  cleanup_attempted: false,
  cleanup_verified: false,
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
      throw new Error("E2E_BASE_URL is required. Run this through npm run e2e:problem-alternatives:live.");
    }
    console.log(`Problem Alternatives Live E2E 서버 주소: ${baseUrl}`);

    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    await step("find-confirmed-problem-card", findConfirmedProblemCard);
    await step("capture-initial-state", captureInitialState);
    await step("create-service-note", createServiceNote);
    await step("reload-persistence", verifyReloadPersistence);
    await step("edit-to-alternative", editToAlternative);
    await step("delete-note", deleteNote);
    await step("verify-final-state", verifyFinalState);
    assertDiagnosticsClean();

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nProblemAlternativesLiveE2E: PASS (${candidateId}, ${initialCount} -> ${initialCount + 1} -> ${initialCount})`);
    console.log("ProblemAlternativesLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)");
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nProblemAlternativesLiveE2E: FAIL");
    console.error(result.error);

    try {
      await cleanupTestNotes();
    } catch (cleanupError) {
      result.cleanup_error = errorMessage(cleanupError);
      console.error(`E2E test note cleanup 실패: ${result.cleanup_error}`);
      if (createdNoteId) console.error(`잔여 가능 note id: ${createdNoteId}`);
    }

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

async function findConfirmedProblemCard() {
  await page.goto(new URL("/problems/compare", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /비교 가능한 confirmed Problem Card \d+개/ }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const first = page.locator('input[name="ids"][type="checkbox"]').first();
  await first.waitFor({ state: "attached", timeout: 30_000 });
  candidateId = await first.getAttribute("value");
  assert.ok(candidateId, "confirmed Problem Card id를 찾지 못했습니다.");
  result.problem_candidate_id = candidateId;
  result.catalog_source_verified = true;
}

async function captureInitialState() {
  const payload = await getAlternatives();
  assert.equal(payload?.eligibility?.eligible, true, "선택한 Problem Card가 alternative note 생성 가능 상태가 아닙니다.");
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  initialCount = notes.length;
  result.initial_note_count = initialCount;

  await page.goto(new URL(`/problem-candidates/${candidateId}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  await alternativesSection().waitFor({ state: "visible", timeout: 30_000 });
  await alternativesSection().getByRole("button", { name: "서비스 / 대안 추가" }).waitFor({ state: "visible" });
}

async function createServiceNote() {
  const section = alternativesSection();
  await section.getByRole("combobox", { name: "종류" }).selectOption("service");
  await section.getByRole("textbox", { name: "이름" }).fill(CREATE_NAME);
  await section.getByRole("textbox", { name: "URL" }).fill(TEST_URL);
  await section.getByRole("textbox", { name: "메모" }).fill(CREATE_NOTE);
  await section.getByRole("button", { name: "서비스 / 대안 추가" }).click();
  await section.getByText("기존 서비스 / 대안 메모를 추가했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const payload = await getAlternatives();
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const created = notes.find((note) => note?.name === CREATE_NAME && note?.note === CREATE_NOTE);
  assert.ok(created?.id, "생성한 E2E alternative note를 API에서 찾지 못했습니다.");
  assert.equal(created.kind, "service");
  assert.equal(created.url, TEST_URL);
  assert.equal(notes.length, initialCount + 1);
  createdNoteId = created.id;
  result.created_note_id = createdNoteId;
  result.create_verified = true;
}

async function verifyReloadPersistence() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await alternativesSection().waitFor({ state: "visible", timeout: 30_000 });
  const card = noteCard();
  await card.waitFor({ state: "visible", timeout: 30_000 });
  await card.getByText(CREATE_NAME, { exact: true }).waitFor({ state: "visible" });
  await card.getByText(CREATE_NOTE, { exact: true }).waitFor({ state: "visible" });
  result.reload_verified = true;
}

async function editToAlternative() {
  const card = noteCard();
  await card.getByRole("button", { name: "수정" }).click();
  await card.locator("select").selectOption("alternative");
  await card.locator("input").nth(0).fill(UPDATED_NAME);
  await card.locator("input").nth(1).fill(TEST_URL);
  await card.locator("textarea").fill(UPDATED_NOTE);
  await card.getByRole("button", { name: "수정 저장" }).click();
  await alternativesSection().getByText("기존 서비스 / 대안 메모를 수정했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const payload = await getAlternatives();
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const updated = notes.find((note) => note?.id === createdNoteId);
  assert.ok(updated, "수정한 E2E alternative note가 사라졌습니다.");
  assert.equal(updated.kind, "alternative");
  assert.equal(updated.name, UPDATED_NAME);
  assert.equal(updated.url, TEST_URL);
  assert.equal(updated.note, UPDATED_NOTE);
  result.update_verified = true;
}

async function deleteNote() {
  const card = noteCard();
  await card.getByRole("button", { name: "삭제", exact: true }).click();
  await card.getByRole("button", { name: "삭제 확정", exact: true }).click();
  await alternativesSection().getByText("기존 서비스 / 대안 메모를 삭제했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const payload = await getAlternatives();
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  assert.equal(notes.some((note) => note?.id === createdNoteId), false);
  assert.equal(notes.length, initialCount);
  result.final_note_count = notes.length;
  result.delete_verified = true;
  result.cleanup_verified = true;
  createdNoteId = null;
}

async function verifyFinalState() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await alternativesSection().waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await page.locator(`article[data-alternative-id]`).filter({ hasText: MARKER }).count(), 0);

  const payload = await getAlternatives();
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  assert.equal(notes.length, initialCount);
  assert.equal(notes.some((note) => String(note?.name ?? "").includes(MARKER)), false);
  result.final_note_count = notes.length;
}

async function cleanupTestNotes() {
  if (!context || !candidateId) return;
  result.cleanup_attempted = true;

  const payload = await getAlternatives();
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const testNotes = notes.filter((note) => String(note?.name ?? "").includes(MARKER));

  for (const note of testNotes) {
    const response = await context.request.delete(
      new URL(`/api/problem-candidates/${candidateId}/alternatives/${note.id}`, baseUrl).href,
    );
    if (!response.ok()) {
      throw new Error(`E2E cleanup DELETE 실패 (${note.id}): HTTP ${response.status()}`);
    }
  }

  const finalPayload = await getAlternatives();
  const finalNotes = Array.isArray(finalPayload?.notes) ? finalPayload.notes : [];
  if (finalNotes.some((note) => String(note?.name ?? "").includes(MARKER))) {
    throw new Error("E2E marker note가 cleanup 후에도 남아 있습니다.");
  }
  result.final_note_count = finalNotes.length;
  result.cleanup_verified = true;
  createdNoteId = null;
}

async function getAlternatives() {
  const response = await context.request.get(
    new URL(`/api/problem-candidates/${candidateId}/alternatives`, baseUrl).href,
  );
  if (!response.ok()) {
    throw new Error(`Problem alternatives API 조회 실패: HTTP ${response.status()}`);
  }
  return response.json();
}

function alternativesSection() {
  return page.locator('section[aria-labelledby="problem-alternatives-title"]');
}

function noteCard() {
  assert.ok(createdNoteId, "E2E alternative note id가 없습니다.");
  return alternativesSection().locator(`article[data-alternative-id="${createdNoteId}"]`);
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
