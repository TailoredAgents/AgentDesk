import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { PDFDocument } from "pdf-lib";
import pg from "pg";
import { encode } from "next-auth/jwt";

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
  AGENTDESK_COPILOT_ENABLED:
    process.env.SMOKE_COPILOT === "1" ? "true" : "false",
  NEXT_TELEMETRY_DISABLED: "1",
  RENDER_GIT_COMMIT: "b".repeat(40),
  CRM_PILOT_ENABLED: "1",
  PILOT_AUTH_SECRET: "production-test-individual-auth-secret-32-characters",
  PILOT_GOOGLE_CLIENT_ID: "mock-identity-client-no-real-login",
  PILOT_GOOGLE_CLIENT_SECRET: "mock-identity-secret-no-real-login",
  LOFTY_APP_APPROVED: "0",
  LOFTY_STATE_VERIFIED: "0",
  CRM_AI_ENABLED: "0",
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
const request = (path, options = {}) => {
  const { timeoutMs = 4_000, ...fetchOptions } = options;
  return fetch(base + path, {
    redirect: "manual",
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
};

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
  assert.equal(
    health.headers.get("x-agentdesk-revision"),
    env.RENDER_GIT_COMMIT,
  );
  assert.equal(
    health.headers.get("x-agentdesk-copilot"),
    process.env.SMOKE_COPILOT === "1" ? "enabled" : "disabled",
  );
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
  assert.equal((await request("/api/copilot?agentId=jordan")).status, 401);
  const copilot = await request("/api/copilot?agentId=jordan", {
    headers: sessionHeaders,
  });
  if (env.AGENTDESK_COPILOT_ENABLED === "true") {
    assert.equal(copilot.status, 200);
    const state = await copilot.json();
    assert.equal(state.available, false);
    const chatCookie = copilot.headers.get("set-cookie").split(";")[0];
    const headers = {
      ...sessionHeaders,
      cookie: `${sessionHeaders.cookie}; ${chatCookie}`,
    };
    const body = {
      agentId: "jordan",
      conversationId: state.conversation.id,
      requestId: randomUUID(),
      text: "What's happening with Sarah?",
      context: {
        page: "today",
        clientId: null,
        propertyId: null,
        packageId: null,
        documentId: null,
      },
    };
    assert.equal(
      (
        await request("/api/copilot", {
          method: "POST",
          headers: { ...headers, origin: "https://untrusted.example" },
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/copilot", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, workspaceId: "private" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/copilot", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            context: { ...body.context, clientId: "robert" },
          }),
        })
      ).status,
      403,
    );
    const reply = await request("/api/copilot", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeoutMs: 10000,
    });
    assert.equal(reply.status, 200);
    const saved = await reply.json();
    assert.equal(saved.conversation.turns[0].status, "failed");
    assert.match(saved.conversation.turns[0].error, /not configured/);
    assert.equal(saved.conversation.turns[0].calls, undefined);
    const other = await request("/api/copilot?agentId=jordan", {
      headers: sessionHeaders,
    });
    const otherCookie = other.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await request("/api/copilot", {
          method: "DELETE",
          headers: {
            ...sessionHeaders,
            cookie: `${sessionHeaders.cookie}; ${otherCookie}`,
          },
          body: JSON.stringify({
            agentId: "jordan",
            conversationId: state.conversation.id,
          }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/api/copilot", {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            agentId: "jordan",
            conversationId: state.conversation.id,
          }),
        })
      ).status,
      200,
    );
    console.log(
      "Copilot HTTP: flag enabled, same-origin checks, strict scope, private history, missing provider and deletion passed.",
    );
  } else {
    assert.equal(copilot.status, 404);
    console.log("Copilot remains disabled in the protected demonstration.");
  }
  // Even a valid shared-demo session cannot access individually authenticated CRM APIs.
  assert.equal((await request("/pilot")).status, 200);
  assert.deepEqual(await (await request("/api/pilot/readiness")).json(), {
    pilotReady: true,
    connectionReady: false,
  });
  assert.equal(
    (await request("/api/pilot/workspace", { headers: sessionHeaders })).status,
    401,
  );
  assert.equal(
    (
      await request("/api/pilot/lofty/connect", {
        method: "POST",
        headers: sessionHeaders,
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/pilot/workspace", {
        method: "POST",
        headers: sessionHeaders,
        body: JSON.stringify({ action: "sync" }),
      })
    ).status,
    401,
  );
  const callback = await request(
    "/api/pilot/lofty/callback?code=untrusted&state=untrusted",
    { headers: sessionHeaders },
  );
  assert.equal(callback.status, 307);
  assert.ok(!callback.headers.get("location").includes("untrusted"));
  assert.equal(
    (await request("/api/pilot/workstyle", { headers: sessionHeaders })).status,
    401,
    "demo sessions cannot read real workstyle profiles",
  );
  // These are synthetic signed sessions in the disposable DB, not a live Google login.
  const authCookieName = "__Secure-authjs.session-token";
  const syntheticSession = await encode({
    secret: env.PILOT_AUTH_SECRET,
    salt: authCookieName,
    token: { sub: "google:production-smoke-agent" },
    maxAge: 60,
  });
  const individualHeaders = {
    ...sessionHeaders,
    cookie: `${authCookieName}=${syntheticSession}`,
  };
  assert.equal(
    (await request("/api/pilot/workspace", { headers: individualHeaders }))
      .status,
    403,
    "unprovisioned individual identities cannot access CRM data",
  );
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    await pool.query(
      "INSERT INTO crm_brokerages (id, name, lofty_team_id) VALUES ('pilot-http-smoke', 'Synthetic HTTP test brokerage', '999888777') ON CONFLICT DO NOTHING",
    );
    await pool.query(
      "INSERT INTO crm_members (id, brokerage_id, subject, label, lofty_user_id, role) VALUES ('pilot-http-agent', 'pilot-http-smoke', 'google:production-smoke-agent', 'Synthetic HTTP Agent', '999888776', 'agent') ON CONFLICT DO NOTHING",
    );
    assert.equal(
      (await request("/api/pilot/workspace", { headers: individualHeaders }))
        .status,
      200,
    );
    assert.equal(
      (await request("/api/workspace", { headers: individualHeaders })).status,
      401,
      "individual identity cannot impersonate the sample login",
    );
    const syntheticRecord = {
      firstName: "Synthetic reset isolation fixture",
      teamId: "999888777",
      assignedUserId: "999888776",
    };
    const privateProfile = await (
      await request("/api/pilot/workstyle", { headers: individualHeaders })
    ).json();
    assert.equal(privateProfile.enabled, false);
    assert.equal(
      (
        await request("/api/pilot/workstyle", {
          method: "POST",
          headers: individualHeaders,
          body: JSON.stringify({
            action: "configure",
            revision: privateProfile.revision,
            values: { noteFormat: "bullets" },
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/pilot/workstyle", {
          method: "POST",
          headers: { ...individualHeaders, origin: "https://attacker.example" },
          body: JSON.stringify({
            action: "learning",
            revision: 1,
            enabled: true,
          }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/agents/jordan/workstyle", {
          headers: individualHeaders,
        })
      ).status,
      401,
    );
    await pool.query(
      "INSERT INTO crm_records (id, connection_id, kind, external_id, lead_id, data, hash, observed_at) SELECT 'pilot-http-record', id, 'lead', '999888775', '999888775', $1::jsonb, 'synthetic-test-only', now() FROM crm_connections WHERE member_id = 'pilot-http-agent'",
      [JSON.stringify(syntheticRecord)],
    );
    assert.equal(
      (
        await request("/api/demo/reset", {
          method: "POST",
          headers: sessionHeaders,
          body: JSON.stringify({ confirmation: "RESTORE FICTIONAL WORKSPACE" }),
        })
      ).status,
      200,
    );
    assert.deepEqual(
      (
        await pool.query(
          "SELECT data FROM crm_records WHERE id = 'pilot-http-record'",
        )
      ).rows[0].data,
      syntheticRecord,
      "restoring the sample cannot modify isolated CRM projections",
    );
    assert.equal(
      (await request("/api/pilot/workspace", { headers: individualHeaders }))
        .status,
      200,
      "sample reset cannot remove individual pilot membership",
    );
    const retainedPrivateProfile = await (
      await request("/api/pilot/workstyle", { headers: individualHeaders })
    ).json();
    assert.equal(
      retainedPrivateProfile.preferences.noteFormat.value,
      "bullets",
      "sample reset preserves private workstyle",
    );
    const jordanProfile = await (
      await request("/api/agents/jordan/workstyle", { headers: sessionHeaders })
    ).json();
    const learningSuggestion = jordanProfile.suggestions.find(
      (s) => s.rule === "followup_style" && s.status === "pending",
    );
    assert.ok(learningSuggestion);
    const acceptedResponse = await request("/api/agents/jordan/workstyle", {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        action: "suggestion",
        id: learningSuggestion.id,
        decision: "accept",
        values: learningSuggestion.proposed,
        revision: jordanProfile.revision,
      }),
    });
    assert.equal(acceptedResponse.status, 200);
    const acceptedProfile = await acceptedResponse.json();
    const styledWorkspace = await (
      await request("/api/workspace", { headers: sessionHeaders })
    ).json();
    assert.equal(
      styledWorkspace.agents.find((a) => a.id === "jordan").workstyle.values
        .followupLength,
      "concise",
    );
    assert.equal(
      styledWorkspace.agents.find((a) => a.id === "olivia").workstyle,
      undefined,
    );
    assert.equal(
      (
        await request("/api/agents/jordan/workstyle", {
          method: "POST",
          headers: sessionHeaders,
          body: JSON.stringify({
            action: "undo",
            revision: acceptedProfile.revision,
            id: acceptedProfile.history[0].id,
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/pilot/lofty/connect", {
          method: "POST",
          headers: individualHeaders,
          body: "{}",
        })
      ).status,
      503,
      "missing Lofty approval blocks Connect",
    );
    assert.equal(
      (
        await request("/api/pilot/workspace", {
          method: "POST",
          headers: { ...individualHeaders, origin: "https://attacker.example" },
          body: JSON.stringify({ action: "sync" }),
        })
      ).status,
      403,
    );
    await pool.query(
      "UPDATE crm_members SET active = false WHERE id = 'pilot-http-agent'",
    );
    assert.equal(
      (await request("/api/pilot/workspace", { headers: individualHeaders }))
        .status,
      403,
      "deprovisioning takes effect with an already signed session",
    );
    assert.equal(
      (await request("/api/pilot/workstyle", { headers: individualHeaders }))
        .status,
      403,
    );
  } finally {
    await pool.query("DELETE FROM crm_records WHERE id = 'pilot-http-record'");
    await pool.query(
      "DELETE FROM crm_connections WHERE member_id = 'pilot-http-agent'",
    );
    await pool.query("DELETE FROM crm_members WHERE id = 'pilot-http-agent'");
    await pool.query(
      "DELETE FROM crm_brokerages WHERE id = 'pilot-http-smoke'",
    );
    await pool.end();
  }
  const mutation = (path, body, method = "POST", timeoutMs = 4_000) =>
    request(path, {
      method,
      headers: sessionHeaders,
      body: JSON.stringify(body),
      timeoutMs,
    });
  const expectJson = async (response, status, label) => {
    const value = await response.json();
    assert.equal(response.status, status, `${label}: ${JSON.stringify(value)}`);
    return value;
  };
  const readWorkspace = async () =>
    expectJson(
      await request("/api/workspace", { headers: sessionHeaders }),
      200,
      "Read workspace",
    );
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
        requestId: randomUUID(),
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

  // Exercise the saved seller deliverable with the real production renderer and durable bytes.
  const beforeProducts = await readWorkspace();
  const product = beforeProducts.workProducts.find(
    (item) =>
      item.kind === "seller_preparation" &&
      item.clientId === "sarah" &&
      item.propertyId === "willow",
  );
  assert.ok(
    product,
    "The fictional seller document must be available without an AI provider.",
  );
  const draft = product.versions.find(
    (version) => version.status === "pending" && version.origin === "sample",
  );
  assert.ok(draft);
  assert.equal(draft.hasPdf, false);
  const versionPath = `/api/work-products/${product.id}/versions/${draft.id}`;
  const pdfPath = `${versionPath}/pdf`;
  assert.equal(
    (await request(pdfPath)).status,
    401,
    "PDF downloads require sign-in.",
  );
  assert.equal(
    (await request(pdfPath, { headers: sessionHeaders })).status,
    404,
    "Pending drafts have no final PDF.",
  );
  const editedContent = {
    ...draft.content,
    introduction:
      "Sarah, please review this preparation guide with Jordan. We have kept confirmed plans separate from general suggestions and questions that still need an answer.",
  };
  const editBody = {
    content: editedContent,
    expectedEditRevision: draft.editRevision,
  };
  assert.equal(
    (
      await request(versionPath, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: env.APP_URL },
        body: JSON.stringify(editBody),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(versionPath, {
        method: "PATCH",
        headers: { ...sessionHeaders, origin: "https://attacker.example" },
        body: JSON.stringify(editBody),
      })
    ).status,
    403,
  );
  const editedData = await expectJson(
    await mutation(versionPath, editBody, "PATCH"),
    200,
    "Save seller document edit",
  );
  const editedDraft = editedData.workProducts
    .find((item) => item.id === product.id)
    .versions.find((item) => item.id === draft.id);
  assert.equal(editedDraft.editRevision, draft.editRevision + 1);
  assert.deepEqual(editedDraft.content, editedContent);
  assert.deepEqual(editedDraft.originalContent, draft.originalContent);
  assert.deepEqual(
    editedDraft.history.map((item) => item.event),
    ["created", "edited"],
  );
  await expectJson(
    await mutation(
      versionPath,
      {
        ...editBody,
        content: {
          ...editedContent,
          introduction:
            "A stale edit must never replace the saved seller document.",
        },
      },
      "PATCH",
    ),
    409,
    "Reject stale document edit",
  );
  assert.equal(
    (await readWorkspace()).workspace.revision,
    editedData.workspace.revision,
  );
  // Clients cannot submit their own finished PDF bytes to bypass server rendering.
  await expectJson(
    await mutation(`${versionPath}/review`, {
      decision: "approved",
      expectedEditRevision: editedDraft.editRevision,
      pdfBase64: "JVBERi0=",
    }),
    400,
    "Reject client-supplied PDF",
  );
  const approvalBody = {
    decision: "approved",
    expectedEditRevision: editedDraft.editRevision,
    content: editedContent,
  };
  const documentApprovals = await Promise.all([
    mutation(`${versionPath}/review`, approvalBody, "POST", 12_000),
    mutation(`${versionPath}/review`, approvalBody, "POST", 12_000),
  ]);
  for (const response of documentApprovals)
    await expectJson(response, 200, "Concurrent document approval");
  const approvedData = await readWorkspace();
  const approved = approvedData.workProducts
    .find((item) => item.id === product.id)
    .versions.find((item) => item.id === draft.id);
  assert.equal(approved.status, "approved");
  assert.equal(approved.hasPdf, true);
  assert.match(approved.pdfSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    approvedData.workspace.revision,
    editedData.workspace.revision + 1,
    "Concurrent approval must commit once.",
  );
  assert.equal(
    approved.history.filter((item) => item.event === "approved").length,
    1,
  );
  assert.equal(
    approvedData.activities.filter(
      (item) => item.kind === "work_product_approved",
    ).length,
    1,
  );
  assert.deepEqual(
    approvedData.tasks,
    beforeProducts.tasks,
    "Document approval must not complete or create tasks.",
  );
  assert.deepEqual(
    approvedData.commitments,
    beforeProducts.commitments,
    "Document approval must not resolve client questions.",
  );
  assert.equal(
    JSON.stringify(approvedData).includes('"pdfBase64"'),
    false,
    "Workspace payloads must omit document bytes.",
  );
  await expectJson(
    await mutation(`${versionPath}/review`, approvalBody),
    200,
    "Retry completed document approval",
  );
  assert.equal(
    (await readWorkspace()).workspace.revision,
    approvedData.workspace.revision,
  );
  const download = await request(`${pdfPath}?download=1`, {
    headers: sessionHeaders,
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type"), /^application\/pdf/);
  assert.match(
    download.headers.get("content-disposition"),
    /^attachment; filename="[a-zA-Z0-9._-]+\.pdf"$/,
  );
  assert.match(download.headers.get("cache-control"), /private/);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  const pdfBytes = Buffer.from(await download.arrayBuffer());
  assert.equal(Number(download.headers.get("content-length")), pdfBytes.length);
  assert.ok(pdfBytes.subarray(0, 8).toString().startsWith("%PDF-"));
  assert.equal(
    createHash("sha256").update(pdfBytes).digest("hex"),
    approved.pdfSha256,
  );
  const parsedPdf = await PDFDocument.load(pdfBytes);
  assert.equal(parsedPdf.getTitle(), editedContent.title);
  assert.equal(parsedPdf.getAuthor(), approved.snapshot.agent.name);
  assert.ok(
    parsedPdf.getPageCount() >= 2 && parsedPdf.getPageCount() <= 24,
    "The seller package must be a complete paginated PDF.",
  );
  for (const page of parsedPdf.getPages())
    assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  assert.equal(
    (await readWorkspace()).workspace.revision,
    approvedData.workspace.revision,
    "Downloading is not a delivery or a completion event.",
  );
  await expectJson(
    await mutation(
      versionPath,
      {
        content: {
          ...editedContent,
          introduction: "An approved version must not be edited in place.",
        },
        expectedEditRevision: approved.editRevision,
      },
      "PATCH",
    ),
    409,
    "Approved document is immutable",
  );
  const copyBody = {
    requestId: randomUUID(),
    kind: product.kind,
    agentId: product.agentId,
    productId: product.id,
    copyVersionId: approved.id,
  };
  const copied = await expectJson(
    await mutation("/api/work-products", copyBody),
    200,
    "Copy approved version without an AI provider",
  );
  assert.equal(copied.productId, product.id);
  assert.notEqual(copied.versionId, approved.id);
  const copyVersions = copied.workspace.workProducts.find(
    (item) => item.id === product.id,
  ).versions;
  assert.equal(copyVersions.length, 2);
  assert.equal(copyVersions[0].version, approved.version + 1);
  assert.equal(copyVersions[0].status, "pending");
  assert.equal(copyVersions[0].hasPdf, false);
  assert.deepEqual(copyVersions[0].content, approved.content);
  assert.deepEqual(
    copyVersions[0].snapshot,
    approved.snapshot,
    "A copied historical version must retain its original source snapshot.",
  );
  assert.deepEqual(
    copyVersions.find((item) => item.id === approved.id),
    approved,
  );
  const copiedAgain = await expectJson(
    await mutation("/api/work-products", copyBody),
    200,
    "Durable work-product request replay",
  );
  assert.equal(copiedAgain.versionId, copied.versionId);
  assert.equal(
    copiedAgain.workspace.workspace.revision,
    copied.workspace.workspace.revision,
  );
  await expectJson(
    await mutation("/api/work-products", {
      ...copyBody,
      copyVersionId: copied.versionId,
    }),
    409,
    "Conflicting reuse of document request identifier",
  );
  const beforeMissingProvider = await readWorkspace();
  await expectJson(
    await mutation("/api/work-products", {
      requestId: randomUUID(),
      kind: "seller_preparation",
      agentId: product.agentId,
      clientId: product.clientId,
      propertyId: product.propertyId,
      sourcePackageId: product.sourcePackageId,
    }),
    503,
    "Seller generation without credentials",
  );
  const briefingAppointment = beforeMissingProvider.appointments.find(
    (item) => item.agentId === "jordan" && item.clientId,
  );
  assert.ok(briefingAppointment);
  await expectJson(
    await mutation("/api/work-products", {
      requestId: randomUUID(),
      kind: "appointment_briefing",
      agentId: briefingAppointment.agentId,
      appointmentId: briefingAppointment.id,
    }),
    503,
    "Briefing generation without credentials",
  );
  const afterMissingProvider = await readWorkspace();
  assert.equal(
    afterMissingProvider.workspace.revision,
    beforeMissingProvider.workspace.revision,
  );
  assert.deepEqual(
    afterMissingProvider.workProducts,
    beforeMissingProvider.workProducts,
  );
  assert.deepEqual(
    afterMissingProvider.activities,
    beforeMissingProvider.activities,
  );

  // Approve real listing records, then explicitly resolve the question and schedule the task.
  const sellerPackage = afterMissingProvider.packages.find(
    (item) => item.id === product.sourcePackageId,
  );
  const questionAction = sellerPackage.actions.find(
    (item) => item.kind === "question" && item.status === "pending",
  );
  const taskAction = sellerPackage.actions.find(
    (item) => item.id === "sarah-checklist" && item.status === "pending",
  );
  assert.ok(questionAction && taskAction);
  const internalDecision = {
    decisions: [questionAction, taskAction].map((item) => ({
      id: item.id,
      status: "approved",
      body: item.body,
    })),
  };
  const internalApprovals = await Promise.all([
    mutation(`/api/packages/${sellerPackage.id}/review`, internalDecision),
    mutation(`/api/packages/${sellerPackage.id}/review`, internalDecision),
  ]);
  for (const response of internalApprovals)
    await expectJson(response, 200, "Approve task and unresolved question");
  const executed = await readWorkspace();
  const questions = executed.commitments.filter(
    (item) => item.sourceActionId === questionAction.id,
  );
  const createdTasks = executed.tasks.filter(
    (item) => item.sourceActionId === taskAction.id,
  );
  assert.equal(questions.length, 1);
  assert.equal(createdTasks.length, 1);
  const question = questions[0],
    calendarTask = createdTasks[0];
  for (const record of [question, calendarTask]) {
    assert.equal(record.agentId, product.agentId);
    assert.equal(record.clientId, product.clientId);
    assert.equal(record.propertyId, product.propertyId);
  }
  assert.equal(question.status, "open");
  assert.equal(calendarTask.status, "open");
  assert.ok(
    executed.recommendations.some((item) =>
      item.commitmentIds.includes(question.id),
    ),
    "The approved open question must reach the follow-up view.",
  );
  const resolved = await expectJson(
    await mutation(
      `/api/commitments/${question.id}`,
      { status: "resolved" },
      "PATCH",
    ),
    200,
    "Resolve recorded seller question",
  );
  assert.equal(
    resolved.commitments.find((item) => item.id === question.id).status,
    "resolved",
  );
  assert.equal(
    resolved.recommendations.some((item) =>
      item.commitmentIds.includes(question.id),
    ),
    false,
  );
  assert.equal(
    (await readWorkspace()).commitments.find((item) => item.id === question.id)
      .status,
    "resolved",
  );
  assert.equal(
    resolved.tasks.find((item) => item.id === calendarTask.id).status,
    "open",
  );
  const calendarPath = `/api/calendar?type=task&id=${encodeURIComponent(calendarTask.id)}`;
  const schedulePath = `/api/tasks/${calendarTask.id}/calendar`;
  assert.equal((await request(calendarPath)).status, 401);
  await expectJson(
    await request(calendarPath, { headers: sessionHeaders }),
    409,
    "A task deadline alone must not create a calendar event",
  );
  const scheduleBody = {
    date: "2026-10-23",
    startTime: "15:00",
    endTime: "15:30",
    timeZone: "America/New_York",
    confirmed: true,
    expectedWorkspaceRevision: resolved.workspace.revision,
  };
  assert.equal(
    (
      await request(schedulePath, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.APP_URL },
        body: JSON.stringify(scheduleBody),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(schedulePath, {
        method: "POST",
        headers: { ...sessionHeaders, origin: "https://attacker.example" },
        body: JSON.stringify(scheduleBody),
      })
    ).status,
    403,
  );
  for (const invalid of [
    { ...scheduleBody, confirmed: false },
    { ...scheduleBody, date: "2026-02-30" },
    { ...scheduleBody, startTime: "" },
    { ...scheduleBody, endTime: "14:30" },
    { ...scheduleBody, timeZone: "Unknown/Zone" },
    {
      ...scheduleBody,
      date: "2026-11-01",
      startTime: "01:30",
      endTime: "02:30",
    },
  ])
    await expectJson(
      await mutation(schedulePath, invalid),
      400,
      "Reject uncertain or invalid calendar time",
    );
  assert.equal(
    (await readWorkspace()).workspace.revision,
    resolved.workspace.revision,
    "Invalid scheduling must have no side effects.",
  );
  const scheduled = await expectJson(
    await mutation(schedulePath, scheduleBody),
    200,
    "Save explicitly confirmed task time",
  );
  const schedule = scheduled.tasks.find(
    (item) => item.id === calendarTask.id,
  ).calendarSchedule;
  assert.equal(schedule.startsAt, "2026-10-23T19:00:00.000Z");
  assert.equal(schedule.endsAt, "2026-10-23T19:30:00.000Z");
  assert.equal(schedule.timeZone, "America/New_York");
  assert.ok(schedule.confirmedAt && schedule.confirmedBy);
  const scheduleRetry = await expectJson(
    await mutation(schedulePath, scheduleBody),
    200,
    "Retry the same confirmed calendar schedule",
  );
  assert.equal(scheduleRetry.workspace.revision, scheduled.workspace.revision);
  assert.deepEqual(
    scheduleRetry.tasks.find((item) => item.id === calendarTask.id)
      .calendarSchedule,
    schedule,
    "An identical scheduling retry must preserve the original confirmation metadata.",
  );
  await expectJson(
    await mutation(schedulePath, { ...scheduleBody, endTime: "16:00" }),
    409,
    "Reject a changed schedule with an old workspace revision",
  );
  const afterStaleSchedule = await readWorkspace();
  assert.equal(
    afterStaleSchedule.workspace.revision,
    scheduled.workspace.revision,
  );
  assert.deepEqual(
    afterStaleSchedule.tasks.find((item) => item.id === calendarTask.id)
      .calendarSchedule,
    schedule,
  );
  assert.equal(
    scheduled.tasks.find((item) => item.id === calendarTask.id).status,
    "open",
  );
  assert.deepEqual(
    scheduled.appointments,
    resolved.appointments,
    "Calendar file preparation does not book an external appointment.",
  );
  const calendar = await request(calendarPath, { headers: sessionHeaders });
  assert.equal(calendar.status, 200);
  assert.match(calendar.headers.get("content-type"), /^text\/calendar/);
  assert.match(calendar.headers.get("content-disposition"), /^attachment/);
  const ics = await calendar.text();
  assert.ok(
    ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"),
  );
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /\r\nDTSTART:20261023T190000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261023T193000Z\r\n/);
  assert.match(ics, /\r\nSTATUS:CONFIRMED\r\n/);
  assert.match(
    ics.replace(/\r\n /g, ""),
    /No invitation was sent and no external calendar was updated/,
  );
  assert.equal(/\r\n(?:ATTENDEE|ORGANIZER|METHOD:REQUEST)/.test(ics), false);
  for (const line of ics.split("\r\n"))
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  const secondCalendar = await (
    await request(calendarPath, { headers: sessionHeaders })
  ).text();
  assert.equal(
    secondCalendar.match(/\r\nUID:([^\r\n]+)/)[1],
    ics.match(/\r\nUID:([^\r\n]+)/)[1],
    "Repeated downloads must retain the event UID.",
  );
  assert.equal(
    (await readWorkspace()).workspace.revision,
    scheduled.workspace.revision,
    "Downloading a calendar file does not imply it was imported.",
  );
  const confirmedAppointment = scheduled.appointments.find(
    (item) => item.status === "confirmed",
  );
  assert.ok(confirmedAppointment);
  const appointmentCalendar = await request(
    `/api/calendar?type=appointment&id=${encodeURIComponent(confirmedAppointment.id)}`,
    { headers: sessionHeaders },
  );
  assert.equal(appointmentCalendar.status, 200);
  const appointmentIcs = await appointmentCalendar.text();
  const utcCalendarTime = (value) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  assert.ok(
    appointmentIcs.includes(
      `\r\nDTSTART:${utcCalendarTime(confirmedAppointment.startsAt)}\r\n`,
    ),
  );
  assert.ok(
    appointmentIcs.includes(
      `\r\nDTEND:${utcCalendarTime(confirmedAppointment.endsAt)}\r\n`,
    ),
  );
  const stillApproved = Buffer.from(
    await (await request(pdfPath, { headers: sessionHeaders })).arrayBuffer(),
  );
  assert.deepEqual(
    stillApproved,
    pdfBytes,
    "Later question/task updates and new versions must not mutate the approved PDF.",
  );

  // The saved connected scenario follows the same protected review and version APIs.
  assert.equal(
    (
      await request("/api/intelligence/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  const beforeChanges = await readWorkspace();
  const photographer = beforeChanges.packages
    .find((p) => p.id === "package-sarah")
    .actions.find((a) => a.id === "sarah-photographer");
  if (photographer.status === "pending")
    await expectJson(
      await mutation("/api/packages/package-sarah/review", {
        decisions: [
          { id: photographer.id, body: photographer.body, status: "approved" },
        ],
      }),
      200,
      "Approve photography task before the change",
    );
  const changeReview = await expectJson(
    await mutation("/api/intelligence/sample", {}),
    200,
    "Load connected saved example without provider credentials",
  );
  const changeRetry = await expectJson(
    await mutation("/api/intelligence/sample", {}),
    200,
    "Retry connected example",
  );
  assert.equal(changeRetry.packageId, changeReview.packageId);
  const changePackage = changeReview.workspace.packages.find(
    (p) => p.id === changeReview.packageId,
  );
  assert.equal(changePackage.origin, "sample");
  assert.equal(
    changePackage.actions.filter((a) => a.kind === "intelligence").length,
    2,
  );
  assert.ok(changePackage.actions.some((a) => a.kind === "task_update"));
  assert.equal(
    changeReview.workspace.clientFacts.find(
      (f) => f.topic === "cleaning" && f.status === "current",
    ).effectiveDate,
    "2026-10-26",
  );
  const changeDecisions = {
    decisions: changePackage.actions.map((a) => ({
      id: a.id,
      body: a.body,
      status: "approved",
    })),
  };
  const changed = await expectJson(
    await mutation(`/api/packages/${changePackage.id}/review`, changeDecisions),
    200,
    "Approve coordinated changes",
  );
  assert.equal(
    changed.clientFacts.find(
      (f) => f.topic === "cleaning" && f.status === "current",
    ).effectiveDate,
    "2026-10-28",
  );
  assert.equal(
    changed.clientFacts.find(
      (f) => f.topic === "photography" && f.status === "current",
    ).certainty,
    "requested",
  );
  assert.equal(
    changed.tasks.filter((t) => t.sourceActionId === "sarah-photographer")
      .length,
    1,
  );
  const refreshedVersion = await expectJson(
    await mutation("/api/work-products", {
      kind: product.kind,
      agentId: product.agentId,
      productId: product.id,
      copyVersionId: draft.id,
      refreshFromCurrent: true,
      requestId: randomUUID(),
    }),
    200,
    "Refresh PDF draft from reviewed facts without AI",
  );
  const fresh = refreshedVersion.workspace.workProducts
    .find((p) => p.id === product.id)
    .versions.find((v) => v.id === refreshedVersion.versionId);
  assert.match(JSON.stringify(fresh.content.sections), /October 28/);
  assert.equal(fresh.status, "pending");
  assert.deepEqual(
    Buffer.from(
      await (await request(pdfPath, { headers: sessionHeaders })).arrayBuffer(),
    ),
    pdfBytes,
  );
  const preference = changed.clientFacts.find(
    (f) => f.topic === "communication" && f.status === "current",
  );
  const correction = await expectJson(
    await mutation(`/api/intelligence/${preference.id}`, {
      requestId: randomUUID(),
      value: "Sarah prefers short email updates.",
      certainty: "confirmed",
      effectiveDate: null,
      retire: false,
    }),
    200,
    "Prepare human correction",
  );
  const correctionPackage = correction.workspace.packages.find(
    (p) => p.id === correction.packageId,
  );
  assert.equal(correctionPackage.origin, "human");
  const corrected = await expectJson(
    await mutation(`/api/packages/${correction.packageId}/review`, {
      decisions: correctionPackage.actions.map((a) => ({
        id: a.id,
        body: a.body,
        status: "approved",
      })),
    }),
    200,
    "Approve human correction",
  );
  assert.equal(
    corrected.clientFacts.find(
      (f) => f.topic === "communication" && f.status === "current",
    ).value,
    "Sarah prefers short email updates.",
  );

  const restored = await mutation("/api/demo/reset", {
    confirmation: "RESTORE FICTIONAL WORKSPACE",
  });
  assert.equal(restored.status, 200);
  const resetData = await restored.json();
  assert.equal(resetData.reviewHistory.length, 0);
  assert.equal(resetData.workProducts.length, 1);
  assert.equal(resetData.workProducts[0].versions.length, 1);
  assert.equal(resetData.workProducts[0].versions[0].status, "pending");
  assert.equal(resetData.workProducts[0].versions[0].hasPdf, false);
  assert.equal(
    resetData.tasks.some((task) => task.calendarSchedule),
    false,
  );
  assert.equal(
    (await request(pdfPath, { headers: sessionHeaders })).status,
    404,
    "Sample reset removes the previously approved artifact.",
  );
  assert.equal(resetData.workspace.referenceDate, "2026-10-23");
  assert.ok(
    resetData.recommendations.some(
      (item) => item.status === "ready_for_review",
    ),
  );
  console.log(
    `Production HTTP checks passed: healthy in ${Math.round(elapsed)}ms; auth, individual pilot isolation and deprovisioning, missing Lofty configuration, partial/concurrent approvals, immutable parsed PDF download, version copying, missing-provider failures, approved questions and tasks, confirmed UTC calendar export, coordinated situation changes, idempotent saved example, human correction, refreshed immutable PDF versions, and sample-only reset verified.`,
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
