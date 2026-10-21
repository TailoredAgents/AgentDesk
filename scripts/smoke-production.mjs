import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// This check may only read an explicitly disposable local PostgreSQL workspace.
const database = new URL(process.env.DATABASE_URL || "invalid:");
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
  "Production smoke tests require a local PostgreSQL test database.",
);
assert.match(database.pathname, /^\/agentdesk_test(?:_[a-z0-9_]+)?$/);
const reservation = net.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  DEMO_PASSWORD: "production-smoke-password",
  SESSION_SECRET: "production-smoke-secret-at-least-thirty-two-characters",
  APP_URL: "https://agentdesk-smoke.example",
  OPENAI_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
const preflight = spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/check-config.ts"],
  { env, encoding: "utf8", timeout: 10_000 },
);
assert.equal(
  preflight.status,
  0,
  "Production configuration preflight must pass.",
);

const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let logs = "";
const capture = (chunk) => {
  logs = (logs + chunk.toString()).slice(-12_000);
};
server.stdout.on("data", capture);
server.stderr.on("data", capture);
server.on("error", (error) => {
  logs += `\nServer failed to start: ${error.code || "unknown"}`;
});
const base = `http://127.0.0.1:${port}`;
const request = (path, options = {}) =>
  fetch(base + path, {
    redirect: "manual",
    ...options,
    signal: AbortSignal.timeout(4_000),
  });

try {
  const deadline = Date.now() + 30_000;
  let healthy = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await request("/api/health");
      if (response.status === 200) {
        healthy = true;
        break;
      }
    } catch {
      /* Wait for the listener; each request is bounded. */
    }
    await delay(200);
  }
  assert.ok(healthy, "Production health must become ready within 30 seconds.");
  const started = performance.now();
  const health = await request("/api/health");
  assert.deepEqual(await health.json(), { status: "ok", database: "ok" });
  const elapsed = performance.now() - started;
  assert.ok(
    elapsed < 4_000,
    "Health must finish within Render's five-second deadline.",
  );
  assert.equal((await request("/api/workspace")).status, 401);
  assert.equal((await request("/login")).status, 200);
  assert.equal((await request("/")).status, 307);
  const crossSiteLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ password: env.DEMO_PASSWORD }),
  });
  assert.equal(crossSiteLogin.status, 403);
  assert.equal(crossSiteLogin.headers.get("set-cookie"), null);
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: env.APP_URL },
    body: JSON.stringify({ password: env.DEMO_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly") && cookie.includes("Secure"));
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Path=\//);
  const workspace = await request("/api/workspace", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(workspace.status, 200);
  const data = await workspace.json();
  assert.equal(data.agents.length, 6);
  console.log(
    `Production HTTP checks passed: healthy in ${Math.round(elapsed)}ms; sign-in and workspace protection verified.`,
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    let timer;
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          server.kill("SIGKILL");
          resolve();
        }, 5_000);
      }),
    ]);
    clearTimeout(timer);
  }
}
