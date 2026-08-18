import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3210;
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = process.platform === "win32"
  ? "node_modules\\.bin\\next.cmd"
  : "./node_modules/.bin/next";

let output = "";
const server = spawn(nextBin, ["start", "-p", String(port)], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    AR_RUNTIME_SMOKE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForServer();

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /사람들이 요즘, 무엇을 불편해하고 있을까요\?/);
  assert.match(homeHtml, /아직 공개된 문제가 없습니다\./);

  const login = await fetch(`${baseUrl}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /로그인/);

  const workspace = await fetch(`${baseUrl}/workspace`, { redirect: "manual" });
  assert.ok([307, 308].includes(workspace.status), `/workspace: ${workspace.status}`);
  assert.equal(new URL(workspace.headers.get("location"), baseUrl).pathname, "/login");

  for (const protectedPath of [
    "/raw-inputs/11111111-1111-4111-8111-111111111111",
    "/problem-candidates/22222222-2222-4222-8222-222222222222",
  ]) {
    const response = await fetch(`${baseUrl}${protectedPath}`, { redirect: "manual" });
    assert.ok([307, 308].includes(response.status), `${protectedPath}: ${response.status}`);
    assert.equal(new URL(response.headers.get("location"), baseUrl).pathname, "/login");
  }

  const recent = await fetch(`${baseUrl}/api/raw-inputs/recent`);
  assert.equal(recent.status, 401);
  assert.equal((await recent.json()).error?.code, "login_required");

  console.log("RuntimeSmoke: PASS (Public Radar, protected workspace, unauthenticated API)");
} finally {
  server.kill("SIGTERM");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited before readiness.\n${output}`);
    }

    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // Retry while Next.js starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Next.js server did not become ready.\n${output}`);
}
