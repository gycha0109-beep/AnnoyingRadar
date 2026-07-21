import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3210;
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = process.platform === "win32"
  ? "node_modules\\.bin\\next.cmd"
  : "./node_modules/.bin/next";

let output = "";
const server = spawn(nextBin, ["start", "-p", String(port)], {
  env: { ...process.env, NODE_ENV: "production" },
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
  assert.match(await home.text(), /로그인하고 시작/);

  const login = await fetch(`${baseUrl}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /로그인/);

  console.log("RuntimeSmoke: PASS (/ and /login)");
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
      if (response.status > 0) {
        return;
      }
    } catch {
      // Retry while Next.js starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Next.js server did not become ready.\n${output}`);
}
