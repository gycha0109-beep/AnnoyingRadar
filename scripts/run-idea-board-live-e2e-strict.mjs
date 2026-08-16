import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "scripts", "run-idea-board-live-e2e-bootstrap.mjs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = path.resolve(
  process.env.E2E_IDEA_BOARD_ARTIFACT_DIR
    ?? path.join(PROJECT_ROOT, "artifacts", "idea-board-live-e2e", `${RUN_ID}-strict`),
);

if (!existsSync(BOOTSTRAP_PATH)) {
  throw new Error(`Idea Board Live E2E bootstrap을 찾을 수 없습니다: ${BOOTSTRAP_PATH}`);
}

const code = await runBootstrap();
if (code !== 0) {
  process.exitCode = code;
} else {
  await assertCleanBrowserDiagnostics();
  console.log("IdeaBoardLiveE2EStrict: PASS (browser page errors: 0, hydration errors: 0)");
}

function runBootstrap() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BOOTSTRAP_PATH], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        E2E_IDEA_BOARD_ARTIFACT_DIR: ARTIFACT_DIR,
      },
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal) {
        reject(new Error(`Idea Board Live E2E bootstrap이 signal=${signal}로 종료되었습니다.`));
        return;
      }
      resolve(exitCode ?? 1);
    });
  });
}

async function assertCleanBrowserDiagnostics() {
  const pageErrors = await readDiagnostic("page-errors.log");
  const browserConsole = await readDiagnostic("browser-console.log");
  const hydrationPattern = /Hydration failed|hydration mismatch/i;

  if (pageErrors.trim()) {
    throw new Error(
      `Idea Board Live E2E browser page error가 감지되었습니다. ${path.join(ARTIFACT_DIR, "page-errors.log")}를 확인하십시오.\n${pageErrors.trim()}`,
    );
  }

  if (hydrationPattern.test(browserConsole)) {
    throw new Error(
      `Idea Board Live E2E hydration 오류가 감지되었습니다. ${path.join(ARTIFACT_DIR, "browser-console.log")}를 확인하십시오.`,
    );
  }
}

async function readDiagnostic(filename) {
  const diagnosticPath = path.join(ARTIFACT_DIR, filename);
  if (!existsSync(diagnosticPath)) {
    throw new Error(`Idea Board Live E2E 진단 파일이 없습니다: ${diagnosticPath}`);
  }
  return readFile(diagnosticPath, "utf8");
}
