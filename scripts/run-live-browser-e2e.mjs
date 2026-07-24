import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = normalizeBaseUrl(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");
const LOGIN_TIMEOUT_MS = positiveInteger(process.env.E2E_LOGIN_TIMEOUT_MS, 10 * 60 * 1000);
const AI_TIMEOUT_MS = positiveInteger(process.env.E2E_AI_TIMEOUT_MS, 4 * 60 * 1000);
const KEEP_OPEN = process.env.E2E_KEEP_OPEN === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const MARKER = `[AR-E2E:${RUN_ID}]`;
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_ARTIFACT_DIR ?? path.join("artifacts", "live-browser-e2e", RUN_ID),
);
const RAW_INPUT_TEXT = process.env.E2E_RAW_TEXT ?? buildRawInputText(MARKER);

let browser;
let context;
let page;
let serverProcess;
let stepIndex = 0;
let traceStarted = false;
let rawInputId = null;
const consoleMessages = [];
const pageErrors = [];
const requestFailures = [];
const result = {
  run_id: RUN_ID,
  marker: MARKER,
  base_url: BASE_URL,
  started_at: new Date().toISOString(),
  raw_input_id: null,
  evidence_count: null,
  candidate_count: null,
  structural_path: null,
  status: "running",
};

await main();

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  try {
    await ensureApplicationServer();
    const chromium = await loadChromium();
    browser = await launchBrowser(chromium);
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;

    page = await context.newPage();
    bindDiagnostics(page);

    await step("login", authenticateManually);
    const rawPath = await step("create-raw-input", createRawInput);
    const evidenceCount = await step("live-evidence-extraction", extractAndReviewEvidence);
    result.evidence_count = evidenceCount;

    const candidates = await step("live-candidate-grouping", confirmEvidenceAndGroupCandidates);
    result.candidate_count = candidates.length;

    await step("candidate-review-structure", () => reviewCandidateStructure(candidates, rawPath));
    await step("confirm-problem-cards", () => confirmAllActiveCandidates(rawPath));
    await step("complete-analysis", () => completeAnalysis(rawPath));
    await step("recent-reentry-readonly", () => verifyRecentReentryAndReadOnly(rawPath));

    result.status = "passed";
    result.completed_at = new Date().toISOString();
    console.log(`\nLiveBrowserE2E: PASS (${rawInputId})`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    result.status = "failed";
    result.completed_at = new Date().toISOString();
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("\nLiveBrowserE2E: FAIL");
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
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  if (!(await isVisible(page.getByRole("button", { name: "로그아웃" })))) {
    await page.goto(new URL("/login", BASE_URL).href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "로그인" }).waitFor({ state: "visible" });
    console.log("브라우저에서 로그인하십시오. 로그인 완료를 자동 감지합니다.");

    await poll(
      async () => {
        const url = new URL(page.url());
        return url.origin === new URL(BASE_URL).origin
          && url.pathname === "/"
          && await isVisible(page.getByRole("button", { name: "로그아웃" }));
      },
      LOGIN_TIMEOUT_MS,
      "로그인 완료",
    );
  }

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "로그아웃" }).waitFor({ state: "visible" });
}

async function createRawInput() {
  await page.getByRole("textbox", { name: "원문", exact: true }).fill(RAW_INPUT_TEXT);
  await page.getByLabel("출처 유형").selectOption("review");
  await page.getByLabel("언어").selectOption("ko");
  await page.getByRole("textbox", { name: "출처 메모" }).fill(MARKER);
  await page.getByRole("button", { name: "Raw Input 저장" }).click();
  await page.waitForURL(/\/raw-inputs\/[0-9a-f-]+$/i, { timeout: 30_000 });

  rawInputId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1);
  assert.match(rawInputId ?? "", /^[0-9a-f-]{36}$/i);
  result.raw_input_id = rawInputId;

  await page.getByRole("heading", { name: "Pain Evidence 추출 및 검토" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  return `/raw-inputs/${rawInputId}`;
}

async function extractAndReviewEvidence() {
  const section = page.locator('section[aria-labelledby="evidence-review-title"]');
  await section.getByRole("button", { name: "AI Evidence 추출", exact: true }).click();

  let evidenceCount = await waitForEvidenceResult(section);
  if (evidenceCount === "retry") {
    await section.getByRole("button", { name: "AI 추출 재시도", exact: true }).click();
    evidenceCount = await waitForEvidenceResult(section, false);
  }

  assert.equal(typeof evidenceCount, "number");
  assert.ok(evidenceCount >= 2, `구조 E2E에는 Evidence가 2개 이상 필요합니다: ${evidenceCount}`);

  const firstCard = section.locator("article.evidence-card").first();
  const summaryInput = firstCard.getByRole("textbox", { name: "한국어 요약" });
  const currentSummary = await summaryInput.inputValue();
  await summaryInput.fill(`${currentSummary} · E2E 검증`);
  await section.getByRole("button", { name: "수정 내용 저장" }).click();
  await section.getByText("Evidence 수정 내용을 저장했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  if (evidenceCount >= 3) {
    const lastCard = section.locator("article.evidence-card").last();
    await lastCard.getByRole("button", { name: "deleted 처리" }).click();
    await poll(
      async () => await section.locator("article.evidence-card").count() === evidenceCount - 1,
      30_000,
      "Evidence 삭제 반영",
    );
    evidenceCount -= 1;
  }

  return evidenceCount;
}

async function waitForEvidenceResult(section, allowRetry = true) {
  return poll(
    async () => {
      const count = await section.locator("article.evidence-card").count();
      const statusTexts = await section.locator(".status-badge").allTextContents();
      if (statusTexts.map((text) => text.trim()).includes("reviewing_evidence") && count > 0) {
        return count;
      }

      if (allowRetry && await isVisible(section.getByRole("button", { name: "AI 추출 재시도", exact: true }))) {
        return "retry";
      }
      return false;
    },
    AI_TIMEOUT_MS,
    "AI Evidence 추출",
  );
}

async function confirmEvidenceAndGroupCandidates() {
  const evidenceSection = page.locator('section[aria-labelledby="evidence-review-title"]');
  await evidenceSection
    .getByRole("button", { name: "남은 Evidence 확정 및 grouping 진입" })
    .click();

  const candidateSection = page.locator('section[aria-labelledby="candidate-grouping-title"]');
  await candidateSection.waitFor({ state: "visible", timeout: 30_000 });

  let retryUsed = false;
  let startUsed = false;
  await poll(
    async () => {
      const cards = await candidateSection.locator("article.candidate-card:not(.candidate-card-discarded)").count();
      const statuses = (await candidateSection.locator(".status-badge").allTextContents())
        .map((text) => text.trim());
      if (statuses.includes("reviewing_candidates") && cards > 0) return true;

      const start = candidateSection.getByRole("button", { name: "Problem Candidate 생성", exact: true });
      if (!startUsed && await isEnabledVisible(start)) {
        startUsed = true;
        await start.click();
      }

      const retry = candidateSection.getByRole("button", { name: "Candidate 묶기 재시도", exact: true });
      if (!retryUsed && await isEnabledVisible(retry)) {
        retryUsed = true;
        await retry.click();
      }
      return false;
    },
    AI_TIMEOUT_MS,
    "AI Candidate 그룹핑",
  );

  const candidates = await readCandidateCards(candidateSection);
  assert.ok(candidates.length >= 1, "Problem Candidate가 생성되지 않았습니다.");
  return candidates;
}

async function reviewCandidateStructure(initialCandidates, rawPath) {
  let selected = initialCandidates.find((candidate) => candidate.evidenceCount > 1)
    ?? initialCandidates[0];
  await openCandidate(selected.href);
  await editDiscardAndRestoreCandidate();

  if (selected.evidenceCount > 1) {
    result.structural_path = "split_then_merge";
    await splitCurrentCandidateThenMergeBack();
    return;
  }

  assert.ok(initialCandidates.length >= 2, "병합·분리 E2E에는 Evidence 참조가 2개 이상 필요합니다.");
  result.structural_path = "merge_then_split_then_merge";
  await mergeCurrentCandidateIntoSibling();
  await splitCurrentCandidateThenMergeBack();

  await page.goto(new URL(rawPath, BASE_URL).href, { waitUntil: "domcontentloaded" });
}

async function editDiscardAndRestoreCandidate() {
  const titleInput = page.getByRole("textbox", { name: "문제 제목" });
  const title = await titleInput.inputValue();
  await titleInput.fill(`${title} [E2E]`);
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await page.getByText("Candidate 수정 내용을 저장했습니다.", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await page.getByPlaceholder("폐기 사유 (선택)").fill(`${MARKER} discard/restore verification`);
  await page.getByRole("button", { name: "Candidate 폐기" }).click();
  await page.getByRole("button", { name: "Candidate 복구" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Candidate 복구" }).click();
  await page.getByRole("button", { name: "문제 카드로 확정" }).waitFor({ state: "visible", timeout: 30_000 });
}

async function mergeCurrentCandidateIntoSibling() {
  const previousPath = new URL(page.url()).pathname;
  const structure = page.locator('section[aria-labelledby="candidate-structure-title"]');
  await structure.waitFor({ state: "visible" });
  const mergeSelect = structure.locator("select").first();
  assert.ok(await mergeSelect.locator("option").count() >= 2, "병합 대상 Candidate가 없습니다.");
  await mergeSelect.selectOption({ index: 1 });
  await structure.getByRole("button", { name: "선택 Candidate에 병합" }).click();
  await page.waitForURL((url) => url.pathname !== previousPath, { timeout: 30_000 });
  await page.getByRole("heading", { name: "문제 정의 수정" }).waitFor({ state: "visible" });
}

async function splitCurrentCandidateThenMergeBack() {
  const checkboxes = page.getByRole("checkbox", { name: "새 Candidate로 분리할 Evidence" });
  assert.ok(await checkboxes.count() >= 1, "분리 가능한 Evidence가 없습니다.");
  await checkboxes.first().check();
  await page.getByPlaceholder("새 Candidate 제목").fill(`${MARKER} 분리 후보`);
  await page.getByPlaceholder("새 Candidate 요약").fill("브라우저 E2E에서 분리 후 병합 복원을 검증하는 후보입니다.");

  const sourcePath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "새 Candidate로 분리" }).click();
  await page.waitForURL((url) => url.pathname !== sourcePath, { timeout: 30_000 });
  await page.getByRole("heading", { name: "문제 정의 수정" }).waitFor({ state: "visible" });
  await mergeCurrentCandidateIntoSibling();
}

async function confirmAllActiveCandidates(rawPath) {
  const rawUrl = new URL(rawPath, BASE_URL).href;

  for (let index = 0; index < 20; index += 1) {
    await page.goto(rawUrl, { waitUntil: "domcontentloaded" });
    const section = page.locator('section[aria-labelledby="candidate-grouping-title"]');
    await section.waitFor({ state: "visible", timeout: 30_000 });
    const candidates = await readCandidateCards(section);
    const draft = candidates.find((candidate) => candidate.status === "draft");
    if (!draft) return;

    await openCandidate(draft.href);
    await page.getByRole("button", { name: "문제 카드로 확정" }).click();
    await page.getByText("Problem Card로 확정했습니다.", { exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
  }

  throw new Error("Candidate 확정 반복이 안전 한도를 초과했습니다.");
}

async function completeAnalysis(rawPath) {
  await page.goto(new URL(rawPath, BASE_URL).href, { waitUntil: "domcontentloaded" });
  const section = page.locator('section[aria-labelledby="candidate-grouping-title"]');
  const complete = section.getByRole("button", { name: "Candidate 검토 완료" });
  await complete.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await complete.isEnabled(), true, "Candidate 검토 완료 버튼이 활성화되지 않았습니다.");
  await complete.click();
  await section.getByText("이 분석은 완료됐습니다.", { exact: false }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await section.getByText("completed", { exact: true }).first().waitFor({ state: "visible" });
}

async function verifyRecentReentryAndReadOnly(rawPath) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "최근 입력 3개" }).waitFor({ state: "visible" });
  const recentLink = page.locator(`a.recent-item[href="${rawPath}"]`).first();
  await recentLink.waitFor({ state: "visible", timeout: 30_000 });
  await recentLink.click();
  await page.waitForURL((url) => url.pathname === rawPath, { timeout: 30_000 });

  const section = page.locator('section[aria-labelledby="candidate-grouping-title"]');
  await section.getByText("completed", { exact: true }).first().waitFor({ state: "visible" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await section.getByText("completed", { exact: true }).first().waitFor({ state: "visible" });
  assert.equal(await section.getByRole("button", { name: "Candidate 검토 완료" }).count(), 0);

  const cardLink = section.getByRole("link", { name: "Problem Card 상세" }).first();
  await cardLink.waitFor({ state: "visible" });
  await cardLink.click();
  await page.getByText("완료된 분석은 읽기 전용입니다.", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("textbox", { name: "문제 제목" }).isDisabled(), true);
}

async function readCandidateCards(section) {
  const cards = section.locator("article.candidate-card:not(.candidate-card-discarded)");
  const candidates = [];

  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const status = (await card.locator(".status-badge").first().textContent() ?? "").trim();
    const evidenceCountText = await card
      .locator("dl.candidate-metrics > div")
      .filter({ hasText: "근거 수" })
      .locator("dd")
      .textContent();
    const link = card.getByRole("link", { name: /후보 검토 및 수정|Problem Card 상세/ });
    const href = await link.getAttribute("href");
    assert.ok(href, `Candidate ${index + 1} 상세 링크가 없습니다.`);

    candidates.push({
      href,
      status,
      evidenceCount: Number.parseInt(evidenceCountText ?? "0", 10),
    });
  }

  return candidates;
}

async function openCandidate(href) {
  await page.goto(new URL(href, BASE_URL).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "문제 정의 수정" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
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

async function ensureApplicationServer() {
  if (await serverAvailable()) return;

  const url = new URL(BASE_URL);
  if (!isLoopback(url.hostname)) {
    throw new Error(`E2E_BASE_URL에 연결할 수 없습니다: ${BASE_URL}`);
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev", "--", "--hostname", url.hostname, "--port", url.port || "3000"];
  const logPath = path.join(ARTIFACT_DIR, "dev-server.log");
  serverProcess = spawn(npm, args, {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (chunk) => void appendFile(logPath, chunk));
  serverProcess.stderr.on("data", (chunk) => void appendFile(logPath, chunk));

  await poll(serverAvailable, 90_000, "Next.js 개발 서버 시작");
}

async function serverAvailable() {
  try {
    const response = await fetch(BASE_URL, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
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
    const playwright = await import("playwright");
    return playwright.chromium;
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

function buildRawInputText(marker) {
  return `${marker}\n온라인 주문 서비스를 사용하면서 서로 다른 문제가 반복됐습니다.\n결제 버튼을 눌렀는데 화면이 멈춰서 결제가 됐는지 알 수 없었습니다.\n결제 완료 알림은 왔지만 주문 내역에는 상품이 나타나지 않았습니다.\n배송 날짜를 바꾸려고 했지만 저장 버튼을 눌러도 이전 날짜로 되돌아갔습니다.\n고객센터 채팅은 연결까지 오래 걸렸고 상담원이 같은 정보를 세 번 다시 물었습니다.\n환불을 요청했는데 처리 상태가 일주일 동안 바뀌지 않아 돈을 돌려받을 수 있을지 불안했습니다.\n앱을 다시 열 때마다 로그인이 풀려 주문 상태를 확인하려면 매번 인증해야 했습니다.`;
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
