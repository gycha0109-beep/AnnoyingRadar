import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER_PATH = path.join(PROJECT_ROOT, "scripts", "run-live-browser-e2e.mjs");
const EXPLICIT_BASE_URL = process.env.E2E_BASE_URL;
const PROJECT_PREFERRED_ENV_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_EVIDENCE_MODEL",
  "OPENAI_EVIDENCE_TIMEOUT_MS",
  "OPENAI_CANDIDATE_MODEL",
  "OPENAI_CANDIDATE_TIMEOUT_MS",
  "OPENAI_IDEA_MODEL",
  "OPENAI_IDEA_TIMEOUT_MS",
]);

assertProjectRoot();
const loadedEnvFiles = loadProjectEnvironment();

if (!EXPLICIT_BASE_URL) {
  assertManagedLiveEnvironment();
  process.env.E2E_BASE_URL = await allocateLoopbackBaseUrl();
  console.log(`Live E2E 전용 서버 주소: ${process.env.E2E_BASE_URL}`);
  if (loadedEnvFiles.length > 0) {
    console.log(`로드한 환경 파일: ${loadedEnvFiles.join(", ")}`);
  }
}

const child = spawn(process.execPath, [RUNNER_PATH], {
  cwd: PROJECT_ROOT,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

child.once("error", (error) => {
  console.error(`Live E2E runner를 시작하지 못했습니다: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Live E2E runner가 signal=${signal}로 종료되었습니다.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});

function assertProjectRoot() {
  for (const requiredPath of ["package.json", path.join("scripts", "run-live-browser-e2e.mjs")]) {
    const absolutePath = path.join(PROJECT_ROOT, requiredPath);
    if (!existsSync(absolutePath)) {
      throw new Error(`AnnoyingRadar 프로젝트 파일을 찾을 수 없습니다: ${absolutePath}`);
    }
  }
}

function loadProjectEnvironment() {
  const nodeEnv = "development";
  const candidates = [
    `.env.${nodeEnv}.local`,
    ".env.local",
    `.env.${nodeEnv}`,
    ".env",
  ];
  const loaded = [];
  const preferredValues = new Map();

  for (const filename of candidates) {
    const envPath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(envPath)) continue;

    const parsed = parseEnv(readFileSync(envPath, "utf8"));
    for (const key of PROJECT_PREFERRED_ENV_KEYS) {
      if (!preferredValues.has(key) && Object.prototype.hasOwnProperty.call(parsed, key)) {
        preferredValues.set(key, String(parsed[key] ?? ""));
      }
    }

    process.loadEnvFile(envPath);
    loaded.push(filename);
  }

  // Node keeps an already-exported shell variable ahead of loadEnvFile(). For
  // this project-owned live gate, the highest-precedence project env file is
  // authoritative for managed Supabase/OpenAI values so stale shell secrets do
  // not silently shadow .env.local. Shell values remain available when no
  // project env file defines the key.
  for (const [key, value] of preferredValues) {
    process.env[key] = value;
  }

  return loaded;
}

function assertManagedLiveEnvironment() {
  const missing = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  if (!(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Live E2E에 필요한 환경변수가 없습니다: ${missing.join(", ")}. `
      + `프로젝트 루트(${PROJECT_ROOT})의 .env.local 또는 현재 shell 환경을 확인하십시오.`,
    );
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
    throw new Error("Live E2E용 loopback port를 할당하지 못했습니다.");
  }

  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return `http://127.0.0.1:${address.port}`;
}
