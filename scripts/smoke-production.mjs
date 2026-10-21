import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// This check may only exercise an explicitly disposable local PostgreSQL workspace.
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
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example",
    },
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
  assert.equal((await workspace.json()).agents.length, 6);
  const sessionHeaders = {
    cookie: cookie.split(";")[0],
    "content-type": "application/json",
    origin: env.APP_URL,
  };
  const mutation = (path, body, method = "POST") =>
    request(path, {
      method,
      headers: sessionHeaders,
      body: JSON.stringify(body),
    });
  const pristine = await mutation("/api/demo/reset", {
    confirmation: "RESTORE FICTIONAL WORKSPACE",
  });
  assert.equal(pristine.status, 200);
  const data = await pristine.json();
  assert.ok(
    data.recommendations.length >= 3,
    "Saved records must surface the presentation follow-ups.",
  );
  assert.equal(
    (await mutation("/api/demo/reset", { confirmation: "wrong phrase" }))
      .status,
    400,
  );
  const candidate = data.packages.find(
    (pkg) =>
      pkg.status === "pending" &&
      pkg.actions.filter((action) => action.status === "pending").length > 1 &&
      pkg.actions.some(
        (action) => action.kind === "message" && action.status === "pending",
      ),
  );
  assert.ok(candidate);
  const action = candidate.actions.find(
    (item) => item.kind === "message" && item.status === "pending",
  );
  const decision = {
    decisions: [
      {
        id: action.id,
        status: "approved",
        body: `${action.body}\n\nReviewed for the fictional presentation.`,
      },
    ],
  };
  assert.equal(
    (await mutation(`/api/packages/${candidate.id}/review`, { decisions: [] }))
      .status,
    400,
  );
  const approvals = await Promise.all([
    mutation(`/api/packages/${candidate.id}/review`, decision),
    mutation(`/api/packages/${candidate.id}/review`, decision),
  ]);
  approvals.forEach((response) => assert.equal(response.status, 200));
  const persisted = await (
    await request("/api/workspace", { headers: sessionHeaders })
  ).json();
  const updated = persisted.packages.find((pkg) => pkg.id === candidate.id);
  assert.equal(
    updated.actions.find((item) => item.id === action.id).status,
    "approved",
  );
  assert.ok(
    updated.actions.some((item) => item.status === "pending"),
    "Undecided actions must remain pending.",
  );
  assert.equal(
    persisted.tasks.length,
    data.tasks.length,
    "Approving a message must not create or complete tasks.",
  );
  assert.deepEqual(
    persisted.tasks.map((task) => [task.id, task.status]),
    data.tasks.map((task) => [task.id, task.status]),
  );
  assert.equal(
    persisted.reviewHistory.filter((item) => item.actionId === action.id)
      .length,
    1,
    "Duplicate approval must have one audit entry.",
  );
  assert.equal(
    persisted.reviewHistory.find((item) => item.actionId === action.id).original
      .body,
    action.body,
  );
  assert.equal(
    (await mutation("/api/follow-ups", { agentId: candidate.agentId })).status,
    200,
  );
  assert.equal(
    (
      await mutation("/api/conversations", {
        requestId: crypto.randomUUID(),
        agentId: candidate.agentId,
        clientId: candidate.clientId,
        propertyId: candidate.propertyId,
        title: "Fictional provider unavailable check",
        transcript:
          "The fictional seller asked for a checklist. The photography appointment has not been confirmed.",
        authorized: true,
        source: "note",
      })
    ).status,
    503,
  );
  const restored = await mutation("/api/demo/reset", {
    confirmation: "RESTORE FICTIONAL WORKSPACE",
  });
  assert.equal(restored.status, 200);
  const resetData = await restored.json();
  assert.equal(resetData.reviewHistory.length, 0);
  assert.equal(resetData.workspace.referenceDate, "2026-10-23");
  assert.ok(
    resetData.recommendations.some(
      (item) => item.status === "ready_for_review",
    ),
  );
  console.log(
    `Production HTTP checks passed: healthy in ${Math.round(elapsed)}ms; sign-in, explicit partial approval, concurrent replay, durable audit, recommendations, missing-provider response, and guarded reset verified.`,
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
