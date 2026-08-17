import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER_PATH = path.join(PROJECT_ROOT, "scripts", "run-problem-comparison-live-e2e.mjs");
const EXPLICIT_BASE_URL = process.env.E2E_BASE_URL;
const PROJECT_PREFERRED_ENV_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

let serverProcess = null;

assertProjectRoot();
const loadedEnvFiles = loadProjectEnvironment();
assertManagedEnvironment();

if (!EXPLICIT_BASE_URL) process.env.E2E_BASE_URL = await allocateLoopbackBaseUrl();
const baseUrl = normalizeBaseUrl(process.env.E2E_BASE_URL);
process.env.E2E_BASE_URL = baseUrl;
console.log(`Problem Comparison Live E2E 전용 서버 주소: ${baseUrl}`);
if (loadedEnvFiles.length > 0) console.log(`로드한 환경 파일: ${loadedEnvFiles.join(", ")}`);

try {
  if (!(await serverAvailable(baseUrl))) {
    const url = new URL(baseUrl);
    if (!isLoopback(url.hostname)) throw new Error(`E2E_BASE_URL에 연결할 수 없습니다: ${baseUrl}`);
    serverProcess = await startApplicationServer(url);
  }
  const code = await runInnerRunner();
  process.exitCode = code;
} finally {
  stopApplicationServer();
}

function assertProjectRoot() {
  for (const requiredPath of ["package.json", path.join("scripts", "run-problem-comparison-live-e2e.mjs")]) {
    const absolutePath = path.join(PROJECT_ROOT, requiredPath);
    if (!existsSync(absolutePath)) throw new Error(`AnnoyingRadar 프로젝트 파일을 찾을 수 없습니다: ${absolutePath}`);
  }
}

function loadProjectEnvironment() {
  const candidates = [".env.development.local", ".env.local", ".env.development", ".env"];
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

  for (const [key, value] of preferredValues) process.env[key] = value;
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
    throw new Error(
      `Problem Comparison Live E2E에 필요한 환경변수가 없습니다: ${missing.join(", ")}. `
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
    throw new Error("Problem Comparison Live E2E용 loopback port를 할당하지 못했습니다.");
  }
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return `http://127.0.0.1:${address.port}`;
}

async function startApplicationServer(url) {
  const args = ["run", "dev", "--", "--hostname", url.hostname, "--port", url.port || "3000"];
  const command = resolvePackageManagerCommand(args);
  const child = spawn(command.file, command.args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
    shell: command.shell,
  });

  const earlyExit = new Promise((_, reject) => {
    child.once("error", (error) => reject(new Error(`개발 서버를 시작하지 못했습니다 (${command.label}): ${error.message}`)));
    child.once("exit", (code, signal) => reject(
      new Error(`개발 서버가 준비 전에 종료되었습니다 (${command.label}, code=${code}, signal=${signal ?? "none"}).`),
    ));
  });

  await Promise.race([
    poll(() => serverAvailable(process.env.E2E_BASE_URL), 90_000, "Next.js 개발 서버 시작"),
    earlyExit,
  ]);
  return child;
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

async function runInnerRunner() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER_PATH], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Problem Comparison Live E2E runner가 signal=${signal}로 종료되었습니다.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function serverAvailable(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} 시간 초과${lastError ? `: ${lastError.message}` : ""}`);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.href.replace(/\/$/, "");
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
