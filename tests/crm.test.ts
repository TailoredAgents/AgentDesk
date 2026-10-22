import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { migrateDatabase, type Database } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import * as s from "../src/lib/crm/schema";
import { loftyConfiguration, pilotConfiguration } from "../src/lib/crm/config";
import { LoftyProvider, mapRecord, proposalSchema } from "../src/lib/crm/lofty";
import {
  encryptTokens,
  decryptTokens,
  externalId,
  parseProviderJson,
  stableHash,
  digest,
} from "../src/lib/crm/security";
import {
  CrmService,
  buildSharedContext,
  findActor,
} from "../src/lib/crm/service";
import {
  allCapabilities,
  employeeNames,
  ProviderError,
  type CrmProvider,
  type Projection,
  type WriteProposal,
} from "../src/lib/crm/types";
import {
  validatePilotWork,
  providerWorkInput,
  type PilotWork,
  type SharedContext,
} from "../src/lib/crm/work";
import { seedDatabase } from "../src/lib/db/seed";

// Controlled provider fixtures only. These tests do NOT establish live Lofty access.
let db: Database,
  close: () => Promise<void>,
  sequence = 100;
before(async () => {
  Object.assign(process.env, {
    CRM_PILOT_ENABLED: "1",
    PILOT_AUTH_SECRET: "test-pilot-session-secret-at-least-32-characters",
    PILOT_GOOGLE_CLIENT_ID: "test-client",
    PILOT_GOOGLE_CLIENT_SECRET: "test-secret",
    APP_URL: "https://crm-test.example",
    CRM_TOKEN_ENCRYPTION_KEY: "01".repeat(32),
    LOFTY_CLIENT_ID: "test-vendor",
    LOFTY_CLIENT_SECRET: "test-vendor-secret",
    LOFTY_APP_APPROVED: "1",
    LOFTY_STATE_VERIFIED: "1",
    LOFTY_CAPABILITIES: allCapabilities.join(","),
  });
  const url = process.env.CRM_TEST_DATABASE_URL;
  if (url) {
    const address = new URL(url);
    assert.ok(["localhost", "127.0.0.1"].includes(address.hostname));
    assert.match(address.pathname, /^\/agentdesk_test_crm[a-z0-9_]*$/);
    const pool = new Pool({ connectionString: url });
    db = pgDrizzle(pool, { schema }) as unknown as Database;
    close = () => pool.end();
  } else {
    const client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema }) as unknown as Database;
    close = () => client.close();
  }
  await migrateDatabase(db, url ? "postgresql" : "pglite");
  assert.equal(
    (await db.select().from(s.members)).length,
    0,
    "CRM integration tests require an empty disposable database",
  );
});
after(async () => {
  await close();
});

class MockLofty implements CrmProvider {
  id = "lofty" as const;
  capabilities = allCapabilities;
  refreshCount = 0;
  writes = 0;
  pageError: Error | null = null;
  writeError: Error | null = null;
  refreshError: Error | null = null;
  relatedError: Error | null = null;
  recordError: Error | null = null;
  pageNext: number | null = null;
  pageRecords: Projection[];
  records = new Map<string, Projection>();
  constructor(
    public userId: string,
    public teamId: string,
    public leadId: string,
  ) {
    this.pageRecords = [this.leadRecord()];
  }
  leadRecord(): Projection {
    return mapRecord("lead", {
      leadId: this.leadId,
      teamId: this.teamId,
      assignedUserId: this.userId,
      firstName: "Test",
      lastName: "Client",
      stage: "Active",
      emails: ["private@example.invalid"],
      phones: ["555-0100"],
      lastUpdateTime: "2026-10-21T10:00:00Z",
    });
  }
  async exchange() {
    return {
      accessToken: "mock-access",
      refreshToken: "mock-refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  async refresh() {
    this.refreshCount++;
    if (this.refreshError) throw this.refreshError;
    return {
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  async identity() {
    return {
      userId: this.userId,
      teamId: this.teamId,
      label: "Test Agent",
      timezone: "America/New_York",
    };
  }
  async leads(_token: string, owner: string, offset: number) {
    assert.equal(owner, this.userId);
    assert.ok(offset >= 0);
    if (this.pageError) throw this.pageError;
    return {
      records: this.pageRecords,
      nextOffset: this.pageNext,
      total: this.pageNext ? this.pageNext + 1 : this.pageRecords.length,
    };
  }
  async lead(_token: string, id: string) {
    if (id !== this.leadId) throw new ProviderError("unavailable");
    return (
      this.pageRecords.find((r) => r.externalId === id) || this.leadRecord()
    );
  }
  async related(
    _token: string,
    kind: Exclude<Projection["kind"], "lead">,
    leadId: string,
  ) {
    if (this.relatedError) throw this.relatedError;
    return {
      records: [...this.records.values()].filter(
        (r) => r.kind === kind && r.leadId === leadId,
      ),
      complete: true,
    };
  }
  async record(_token: string, _kind: "note" | "task", id: string) {
    if (this.recordError) throw this.recordError;
    const value = this.records.get(id);
    if (!value) throw new ProviderError("unavailable");
    return value;
  }
  async write(_token: string, proposal: WriteProposal) {
    this.writes++;
    if (this.writeError) throw this.writeError;
    const id =
      proposal.targetId || String(7000000000000000000n + BigInt(sequence++));
    const kind = proposal.operation === "notes.create" ? "note" : "task";
    this.records.set(
      id,
      mapRecord(kind, {
        ...(kind === "note" ? { noteId: id } : { id }),
        leadId: proposal.leadId,
        content: proposal.content,
        type: "Other",
        endAt: proposal.endAt,
        lastUpdate: "2026-10-22T10:00:00Z",
      }),
    );
    return { externalId: id };
  }
}
async function fixture(role: "agent" | "leader" = "agent", team?: string) {
  const i = String(sequence++),
    brokerageId = team || `pilot-${i}`;
  let [broker] = await db
    .select()
    .from(s.brokerages)
    .where(eq(s.brokerages.id, brokerageId));
  if (!broker)
    [broker] = await db
      .insert(s.brokerages)
      .values({
        id: brokerageId,
        name: `Test Brokerage ${i}`,
        loftyTeamId: String(8000000000000000000n + BigInt(i)),
      })
      .returning();
  const subject = `google:individual-${i}`,
    memberId = randomUUID(),
    userId = String(6000000000000000000n + BigInt(i));
  await db.insert(s.members).values({
    id: memberId,
    subject,
    brokerageId,
    label: `Agent ${i}`,
    loftyUserId: userId,
    role,
  });
  const provider = new MockLofty(
    userId,
    broker.loftyTeamId,
    String(1738234566814937000n + BigInt(i)),
  );
  const service = new CrmService(db, provider);
  return {
    subject,
    memberId,
    brokerageId,
    provider,
    service,
    leadId: provider.leadId,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function connect(f: Fixture) {
  const started = await f.service.startAuthorization(f.subject);
  const state = new URL(started.authorizationUrl).searchParams.get("state")!;
  assert.deepEqual(
    await f.service.finishAuthorization(
      f.subject,
      state,
      started.browserNonce,
      "mock-code",
    ),
    { ok: true },
  );
  return (await f.service.status(f.subject)).connection;
}
async function ready(f: Fixture) {
  await connect(f);
  assert.equal((await f.service.sync(f.subject)).ok, true);
}
async function proposal(f: Fixture, input?: WriteProposal) {
  return f.service.propose(
    f.subject,
    randomUUID(),
    input || {
      operation: "notes.create",
      leadId: f.leadId,
      content: "Client requested a preparation checklist.",
    },
  );
}
const isDenied = (error: unknown) =>
  error instanceof Error && "status" in error && error.status === 403;

test("64-bit IDs remain exact through parsing, mapping, request serialization and hashing", () => {
  const raw = parseProviderJson(
    '{"leadId":1738234566814937089,"teamId":8000000000000000001,"assignedUserId":6000000000000000001}',
  );
  const lead = mapRecord("lead", raw);
  assert.equal(lead.externalId, "1738234566814937089");
  assert.equal(lead.data.teamId, "8000000000000000001");
  assert.throws(() => externalId(1738234566814937089));
  assert.throws(() => externalId("9223372036854775808"));
  assert.throws(() => parseProviderJson('{"__proto__":{}}'));
  assert.equal(stableHash({ b: 1, a: 2 }), stableHash({ a: 2, b: 1 }));
  const note = mapRecord("note", {
    id: 100,
    noteId: "1738234566814937089",
    leadId: "100",
    content: "Exact note",
  });
  assert.equal(
    note.externalId,
    "1738234566814937089",
    "timeline IDs are not note IDs",
  );
});
test("encryption authenticates connection scope and detects tampering", () => {
  const value = encryptTokens({ accessToken: "secret" }, "connection-a");
  assert.ok(!value.includes("secret"));
  assert.deepEqual(decryptTokens(value, "connection-a"), {
    accessToken: "secret",
  });
  assert.throws(() => decryptTokens(value, "connection-b"));
  assert.throws(() =>
    decryptTokens(value.replace(/\.[^.]+$/, ".bad"), "connection-a"),
  );
  assert.throws(() => encryptTokens({}, "x", "short"));
});
test("configuration never enables a live connector from credentials alone", () => {
  assert.equal(pilotConfiguration({ NODE_ENV: "test" }).ready, false);
  assert.equal(loftyConfiguration({ NODE_ENV: "test" }).ready, false);
  assert.equal(
    loftyConfiguration({ ...process.env, LOFTY_STATE_VERIFIED: "0" }).ready,
    false,
  );
  assert.equal(
    loftyConfiguration({ ...process.env, LOFTY_APP_APPROVED: "0" }).ready,
    false,
  );
  assert.equal(
    loftyConfiguration({
      ...process.env,
      LOFTY_CAPABILITIES: "leads.read,notes.create",
    }).ready,
    false,
  );
  assert.equal(
    loftyConfiguration({
      ...process.env,
      APP_URL: "https://crm-test.example/unsafe",
    }).ready,
    false,
  );
});
test("OAuth state binds subject, browser, expiry and a single use", async () => {
  const a = await fixture(),
    b = await fixture();
  const start = await a.service.startAuthorization(a.subject),
    state = new URL(start.authorizationUrl).searchParams.get("state")!;
  await assert.rejects(
    a.service.finishAuthorization(b.subject, state, start.browserNonce, "x"),
  );
  await assert.rejects(
    a.service.finishAuthorization(a.subject, state, "wrong", "x"),
  );
  assert.deepEqual(
    await a.service.finishAuthorization(
      a.subject,
      state,
      start.browserNonce,
      "x",
    ),
    { ok: true },
  );
  await assert.rejects(
    a.service.finishAuthorization(a.subject, state, start.browserNonce, "x"),
  );
  const c = await fixture(),
    expired = await c.service.startAuthorization(c.subject),
    expiredState = new URL(expired.authorizationUrl).searchParams.get("state")!;
  await db
    .update(s.states)
    .set({ expiresAt: "2020-01-01T00:00:00Z" })
    .where(eq(s.states.hash, digest(expiredState)));
  await assert.rejects(
    c.service.finishAuthorization(
      c.subject,
      expiredState,
      expired.browserNonce,
      "x",
    ),
  );
});
test("denied authorization and mismatched accounts never connect", async () => {
  const f = await fixture();
  let start = await f.service.startAuthorization(f.subject);
  assert.equal(
    (
      await f.service.finishAuthorization(
        f.subject,
        new URL(start.authorizationUrl).searchParams.get("state")!,
        start.browserNonce,
        undefined,
        true,
      )
    ).ok,
    false,
  );
  start = await f.service.startAuthorization(f.subject);
  f.provider.teamId = "999";
  assert.equal(
    (
      await f.service.finishAuthorization(
        f.subject,
        new URL(start.authorizationUrl).searchParams.get("state")!,
        start.browserNonce,
        "x",
      )
    ).ok,
    false,
  );
  const status = await f.service.status(f.subject);
  assert.notEqual(status.connection.status, "connected");
  assert.equal(status.connection.identity, null);
});
test("agents and brokerages remain isolated; leader view does not widen record access", async () => {
  const a = await fixture("leader"),
    b = await fixture("agent", a.brokerageId),
    other = await fixture();
  await ready(a);
  await ready(b);
  await ready(other);
  const write = await proposal(a);
  await assert.rejects(a.service.leadContext(b.subject, a.leadId), isDenied);
  await assert.rejects(a.service.review(b.subject, write.id, true), isDenied);
  await assert.rejects(a.service.execute(other.subject, write.id), isDenied);
  await assert.rejects(a.service.leadContext(a.subject, b.leadId), isDenied);
  const status = await a.service.status(a.subject);
  assert.equal(status.team.length, 2);
  assert.equal((await b.service.status(b.subject)).team.length, 0);
  assert.ok(!JSON.stringify(status).includes("mock-access"));
  assert.ok(!("tokens" in status.connection));
  await assert.rejects(findActor(db, "shared-demo-cookie"), isDenied);
  await db
    .update(s.members)
    .set({ active: false })
    .where(eq(s.members.id, a.memberId));
  await assert.rejects(a.service.status(a.subject), isDenied);
  await assert.rejects(a.service.execute(a.subject, write.id), isDenied);
});
test("duplicate imports update exact external identities without duplicating records", async () => {
  const f = await fixture();
  await ready(f);
  await f.service.sync(f.subject);
  assert.equal((await f.service.status(f.subject)).leads.length, 1);
  f.provider.pageRecords.push({
    ...f.provider.leadRecord(),
    externalId: "222",
    leadId: "222",
    data: { ...f.provider.leadRecord().data, leadId: "222" },
  });
  await f.service.sync(f.subject);
  assert.equal(
    (await f.service.status(f.subject)).leads.length,
    2,
    "same name/email must not merge different provider IDs",
  );
});
test("full reconciliation hides missing leads, partial refresh never claims deletion", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.pageRecords = [];
  f.provider.pageNext = 100;
  await f.service.sync(f.subject);
  assert.equal((await f.service.status(f.subject)).leads.length, 1);
  f.provider.pageNext = null;
  await f.service.sync(f.subject);
  assert.equal((await f.service.status(f.subject)).leads.length, 0);
  await assert.rejects(f.service.leadContext(f.subject, f.leadId), isDenied);
});
test("out-of-order and conflicting source revisions cannot overwrite newer CRM facts", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.pageRecords = [
    {
      ...f.provider.leadRecord(),
      sourceUpdatedAt: "2026-10-20T10:00:00.000Z",
      data: { ...f.provider.leadRecord().data, stage: "Old stage" },
    },
  ];
  await f.service.sync(f.subject);
  const context = await f.service.leadContext(f.subject, f.leadId);
  assert.equal(context.sources[0].data.stage, "Active");
  assert.equal(context.sources[0].freshness, "conflict");
});
test("assignment changes and provider permission failures remove cached visibility", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.pageRecords = [
    {
      ...f.provider.leadRecord(),
      data: { ...f.provider.leadRecord().data, assignedUserId: "999" },
    },
  ];
  assert.equal((await f.service.refreshLead(f.subject, f.leadId)).ok, false);
  await assert.rejects(f.service.leadContext(f.subject, f.leadId), isDenied);
  f.provider.pageRecords = [f.provider.leadRecord()];
  await f.service.sync(f.subject);
  f.provider.pageError = new ProviderError("permission");
  await f.service.sync(f.subject);
  assert.equal((await f.service.status(f.subject)).leads.length, 0);
});
test("missing related records and partial permission failures are recorded honestly", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.records.set(
    "10",
    mapRecord("note", {
      noteId: "10",
      leadId: f.leadId,
      content: "Existing note",
    }),
  );
  await f.service.refreshLead(f.subject, f.leadId);
  assert.equal(
    (await f.service.leadContext(f.subject, f.leadId)).sources.length,
    2,
  );
  f.provider.relatedError = new ProviderError("permission");
  const result = await f.service.refreshLead(f.subject, f.leadId);
  assert.equal(result.ok, true);
  assert.equal(
    (await f.service.leadContext(f.subject, f.leadId)).sources.length,
    1,
  );
  assert.equal(
    (await f.service.status(f.subject)).history[0].status,
    "partial",
  );
});
test("expired access tokens rotate once under concurrent synchronization", async () => {
  const f = await fixture();
  const c = await connect(f);
  const tokens = {
    accessToken: "expired",
    refreshToken: "old-refresh",
    expiresAt: "2020-01-01T00:00:00Z",
  };
  await db
    .update(s.connections)
    .set({
      tokens: encryptTokens(
        tokens,
        `${c.id}:${c.brokerageId}:${c.memberId}:lofty`,
      ),
    })
    .where(eq(s.connections.id, c.id));
  await Promise.all([f.service.sync(f.subject), f.service.sync(f.subject)]);
  assert.equal(f.provider.refreshCount, 1);
  const [stored] = await db
    .select()
    .from(s.connections)
    .where(eq(s.connections.id, c.id));
  assert.ok(!stored.tokens?.includes("rotated-refresh"));
  assert.equal(
    decryptTokens<{ refreshToken: string }>(
      stored.tokens!,
      `${c.id}:${c.brokerageId}:${c.memberId}:lofty`,
    ).refreshToken,
    "rotated-refresh",
  );
});
test("revocation clears tokens and real data visibility", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.pageError = new ProviderError("unauthorized");
  await f.service.sync(f.subject);
  const state = await f.service.status(f.subject);
  assert.equal(state.connection.status, "reauth_required");
  assert.equal(state.leads.length, 0);
  const [c] = await db
    .select()
    .from(s.connections)
    .where(eq(s.connections.id, state.connection.id));
  assert.equal(c.tokens, null);
});
test("rate limits persist cooldown rather than looping on requests", async () => {
  const f = await fixture();
  await ready(f);
  f.provider.pageError = new ProviderError("rate_limited", 120);
  await f.service.sync(f.subject);
  const state = await f.service.status(f.subject);
  assert.ok(Date.parse(state.connection.cooldownUntil!) > Date.now() + 100_000);
  f.provider.pageError = null;
  assert.equal((await f.service.sync(f.subject)).ok, false);
});
test("refresh-token revocation fails closed and does not retry the expired token", async () => {
  const f = await fixture();
  const c = await connect(f);
  await db
    .update(s.connections)
    .set({
      tokens: encryptTokens(
        {
          accessToken: "expired",
          refreshToken: "revoked",
          expiresAt: "2020-01-01T00:00:00Z",
        },
        `${c.id}:${c.brokerageId}:${c.memberId}:lofty`,
      ),
    })
    .where(eq(s.connections.id, c.id));
  f.provider.refreshError = new ProviderError("unauthorized");
  assert.equal((await f.service.sync(f.subject)).ok, false);
  assert.equal(
    (await f.service.status(f.subject)).connection.status,
    "reauth_required",
  );
  assert.equal(f.provider.refreshCount, 1);
});
test("access removal redacts derived work and pending write bodies", async () => {
  const f = await fixture();
  await ready(f);
  const p = await proposal(f);
  await f.service.review(f.subject, p.id, true);
  await f.service.prepare(
    f.subject,
    f.leadId,
    randomUUID(),
    "Photography requested for Thursday",
    async (_c, text) => fakeWork(text),
  );
  f.provider.pageRecords = [];
  await f.service.sync(f.subject);
  const status = await f.service.status(f.subject);
  assert.ok(status.work.every((w) => w.content === null));
  assert.equal(status.execution[0].status, "canceled");
  assert.ok(
    !JSON.stringify(status).includes("Photography requested for Thursday"),
  );
});
test("write approval, submission, confirmation and idempotency are distinct", async () => {
  const f = await fixture();
  await ready(f);
  const id = randomUUID();
  const input = {
    operation: "notes.create",
    leadId: f.leadId,
    content: "Agreed to send a checklist.",
  };
  const a = await f.service.propose(f.subject, id, input),
    b = await f.service.propose(f.subject, id, input);
  assert.equal(a.id, b.id);
  await assert.rejects(
    f.service.propose(f.subject, id, {
      ...input,
      content: "Different content",
    }),
  );
  await f.service.execute(f.subject, a.id);
  assert.equal(f.provider.writes, 0);
  await f.service.review(f.subject, a.id, true);
  const submitted = await Promise.all([
    f.service.execute(f.subject, a.id),
    f.service.execute(f.subject, a.id),
  ]);
  assert.equal(f.provider.writes, 1);
  assert.ok(submitted.some((r) => r.status === "submitted"));
  f.provider.recordError = new ProviderError("unavailable");
  const waiting = await f.service.confirm(f.subject, a.id);
  assert.equal(waiting.status, "submitted");
  assert.equal(waiting.errorCode, "awaiting_provider_visibility");
  f.provider.recordError = null;
  const confirmed = await f.service.confirm(f.subject, a.id);
  assert.equal(confirmed.status, "applied");
  assert.ok(confirmed.confirmedAt);
  await f.service.execute(f.subject, a.id);
  assert.equal(f.provider.writes, 1);
});
test("ambiguous network outcomes cannot retry a create", async () => {
  const f = await fixture();
  await ready(f);
  const p = await proposal(f);
  await f.service.review(f.subject, p.id, true);
  f.provider.writeError = new ProviderError("network");
  assert.equal(
    (await f.service.execute(f.subject, p.id)).status,
    "outcome_unknown",
  );
  f.provider.writeError = null;
  await f.service.execute(f.subject, p.id);
  assert.equal(f.provider.writes, 1);
});
test("task updates preflight the exact task, lead and content revision", async () => {
  const f = await fixture();
  await ready(f);
  const task = mapRecord("task", {
    id: "123",
    leadId: f.leadId,
    content: "Original task",
    type: "Other",
    endAt: "2026-10-25T17:00:00Z",
  });
  f.provider.records.set("123", task);
  const p = await proposal(f, {
    operation: "tasks.update",
    leadId: f.leadId,
    targetId: "123",
    content: "New description",
    expectedHash: stableHash(task.data),
  });
  await f.service.review(f.subject, p.id, true);
  f.provider.records.set("123", {
    ...task,
    data: { ...task.data, content: "Changed externally" },
  });
  assert.equal((await f.service.execute(f.subject, p.id)).status, "conflict");
  assert.equal(f.provider.writes, 0);
  const p2 = await proposal(f, {
    operation: "tasks.create",
    leadId: f.leadId,
    content: "Prepare checklist",
    endAt: "2026-10-26T17:00:00Z",
  });
  await f.service.review(f.subject, p2.id, true);
  await f.service.execute(f.subject, p2.id);
  assert.equal((await f.service.confirm(f.subject, p2.id)).status, "applied");
});
test("a matching task revision updates and confirms; a foreign lead task never writes", async () => {
  const f = await fixture();
  await ready(f);
  const task = mapRecord("task", {
    id: "321",
    leadId: f.leadId,
    content: "Original",
    type: "Other",
    endAt: "2026-10-25T17:00:00Z",
  });
  f.provider.records.set("321", task);
  const p = await proposal(f, {
    operation: "tasks.update",
    leadId: f.leadId,
    targetId: "321",
    content: "Reviewed update",
    expectedHash: stableHash(task.data),
  });
  await f.service.review(f.subject, p.id, true);
  assert.equal((await f.service.execute(f.subject, p.id)).status, "submitted");
  assert.equal((await f.service.confirm(f.subject, p.id)).status, "applied");
  const foreign = { ...task, leadId: "888" };
  f.provider.records.set("321", foreign);
  const p2 = await proposal(f, {
    operation: "tasks.update",
    leadId: f.leadId,
    targetId: "321",
    content: "Do not write",
    expectedHash: stableHash(foreign.data),
  });
  await f.service.review(f.subject, p2.id, true);
  await f.service.execute(f.subject, p2.id);
  assert.equal(f.provider.writes, 1);
});
test("missing write permission cannot be bypassed by an approved proposal", async () => {
  const f = await fixture();
  await ready(f);
  const p = await proposal(f);
  await f.service.review(f.subject, p.id, true);
  const c = (await f.service.status(f.subject)).connection;
  await db
    .update(s.connections)
    .set({ capabilities: ["leads.read"] })
    .where(eq(s.connections.id, c.id));
  assert.equal((await f.service.execute(f.subject, p.id)).status, "failed");
  assert.equal(f.provider.writes, 0);
});
test("rejection, disconnect and invalidated OAuth callbacks cannot execute work", async () => {
  const f = await fixture();
  await ready(f);
  const p = await proposal(f);
  await f.service.review(f.subject, p.id, false);
  await f.service.execute(f.subject, p.id);
  assert.equal(f.provider.writes, 0);
  const p2 = await proposal(f);
  await f.service.review(f.subject, p2.id, true);
  await f.service.disconnect(f.subject);
  const state = await f.service.status(f.subject);
  assert.equal(state.connection.identity, null);
  assert.equal(state.leads.length, 0);
  assert.equal(state.execution.find((w) => w.id === p2.id)?.status, "canceled");
  assert.ok(!JSON.stringify(state.execution).includes("preparation checklist"));
  await f.service.execute(f.subject, p2.id);
  assert.equal(f.provider.writes, 0);
  const g = await fixture();
  const start = await g.service.startAuthorization(g.subject);
  await g.service.disconnect(g.subject);
  await assert.rejects(
    g.service.finishAuthorization(
      g.subject,
      new URL(start.authorizationUrl).searchParams.get("state")!,
      start.browserNonce,
      "x",
    ),
  );
});
function fakeWork(transcript: string): PilotWork {
  return {
    summary: "Review the sourced plan.",
    warnings: [],
    employees: employeeNames.map((employee) => ({
      employee,
      recommendation: "Review the recorded plan before acting.",
      evidence: transcript
        ? [{ source: "conversation", quote: transcript }]
        : [],
    })),
    messageDraft: "",
    noteDraft: transcript,
    observations: transcript
      ? [
          {
            key: "photography",
            value: transcript,
            certainty: transcript.includes("confirmed")
              ? "confirmed"
              : "tentative",
            evidence: { source: "conversation", quote: transcript },
          },
        ]
      : [],
  };
}
test("all employees share one scoped snapshot; stale sources are qualified and contact data minimized", async () => {
  const f = await fixture();
  await ready(f);
  const state = await f.service.status(f.subject);
  await db
    .update(s.records)
    .set({ observedAt: "2020-01-01T00:00:00Z" })
    .where(eq(s.records.connectionId, state.connection.id));
  const context = await f.service.leadContext(f.subject, f.leadId);
  assert.deepEqual(context.employees, [...employeeNames]);
  assert.equal(context.sources[0].freshness, "stale");
  const work = validatePilotWork(fakeWork(""), context, "");
  assert.ok(work.warnings.some((v) => v.includes("stale")));
  const minimized = JSON.stringify(providerWorkInput(context, ""));
  assert.ok(!minimized.includes("private@example.invalid"));
  assert.ok(!minimized.includes("555-0100"));
  const bad = fakeWork("invented confirmation");
  assert.throws(() => validatePilotWork(bad, context, "Actual client request"));
});
test("AI work is persisted with snapshot, and confirmed replacements supersede tentative plans explicitly", async () => {
  const f = await fixture();
  await ready(f);
  const generate = async (_context: SharedContext, text: string) =>
    fakeWork(text);
  const first = await f.service.prepare(
    f.subject,
    f.leadId,
    randomUUID(),
    "Photography requested for Thursday",
    generate,
  );
  await f.service.reviewFact(f.subject, first.id, 0, false);
  const next = await f.service.prepare(
    f.subject,
    f.leadId,
    randomUUID(),
    "Photography confirmed for Friday",
    generate,
  );
  await assert.rejects(f.service.reviewFact(f.subject, next.id, 0, false));
  await f.service.reviewFact(f.subject, next.id, 0, true);
  const context = await f.service.leadContext(f.subject, f.leadId);
  assert.equal(
    context.reviewedIntelligence.filter((f) => f.status === "current").length,
    1,
  );
  assert.equal(
    context.reviewedIntelligence.filter((f) => f.status === "superseded")
      .length,
    1,
  );
  const tentative = await f.service.prepare(
    f.subject,
    f.leadId,
    randomUUID(),
    "Photography maybe Saturday",
    generate,
  );
  await assert.rejects(f.service.reviewFact(f.subject, tentative.id, 0, true));
  const other = await fixture();
  await assert.rejects(
    f.service.reviewFact(other.subject, next.id, 0, true),
    isDenied,
  );
  await f.service.disconnect(f.subject);
  assert.equal((await f.service.status(f.subject)).work.length, 0);
});
test("changes during AI generation invalidate the draft and disconnect prevents late saves", async () => {
  const f = await fixture();
  await ready(f);
  const generated = await f.service.prepare(
    f.subject,
    f.leadId,
    randomUUID(),
    "New note",
    async () => {
      f.provider.pageRecords = [
        {
          ...f.provider.leadRecord(),
          sourceUpdatedAt: "2026-10-23T00:00:00Z",
          data: { ...f.provider.leadRecord().data, stage: "Updated" },
        },
      ];
      await f.service.sync(f.subject);
      return fakeWork("New note");
    },
  );
  assert.equal(generated.status, "context_changed");
  await assert.rejects(
    f.service.prepare(
      f.subject,
      f.leadId,
      randomUUID(),
      "New note",
      async () => {
        await f.service.disconnect(f.subject);
        return fakeWork("New note");
      },
    ),
  );
});
test("sample seeding does not touch pilot identity, connection or cached records", async () => {
  const f = await fixture();
  await ready(f);
  const before = (await f.service.status(f.subject)).leads;
  await seedDatabase(db);
  assert.deepEqual((await f.service.status(f.subject)).leads, before);
  assert.equal((await db.select().from(schema.agents)).length, 6);
});
test("REST adapter sends documented paths, Basic exchange, refresh forms and exact string IDs", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const replies = [
    {
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openApi",
    },
    {
      access_token: "b",
      refresh_token: "r2",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openApi",
    },
    {
      memberUserId: "6000000000000000001",
      teamId: "8000000000000000001",
      firstName: "Agent",
    },
    {
      lead: {
        leadId: "1738234566814937089",
        assignedUserId: "6000000000000000001",
        teamId: "8000000000000000001",
      },
    },
    {
      notes: [
        { noteId: "123", leadId: "1738234566814937089", content: "Hello" },
      ],
    },
    { noteId: "1738234566814937090" },
  ];
  const mockFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(replies.shift());
  };
  const adapter = new LoftyProvider(
    {
      clientId: "client",
      clientSecret: "secret",
      callbackUrl: "https://app.example/callback",
    },
    mockFetch,
  );
  await adapter.exchange("code");
  await adapter.refresh("r");
  await adapter.identity("a");
  await adapter.lead("a", "1738234566814937089");
  await adapter.related("a", "note", "1738234566814937089");
  const result = await adapter.write("a", {
    operation: "notes.create",
    leadId: "1738234566814937089",
    content: "Human-approved note",
  });
  assert.equal(result.externalId, "1738234566814937090");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(
    new URLSearchParams(String(calls[0].init?.body)).get("grant_type"),
    "authorization_code",
  );
  assert.equal(
    new Headers(calls[0].init?.headers).get("Authorization"),
    `Basic ${Buffer.from("client:secret").toString("base64")}`,
  );
  assert.equal(
    new URLSearchParams(String(calls[1].init?.body)).get("grant_type"),
    "refresh_token",
  );
  assert.equal(
    calls[3].url,
    "https://api.lofty.com/v1.0/leads/1738234566814937089",
  );
  assert.equal(
    JSON.parse(String(calls[5].init?.body)).leadId,
    "1738234566814937089",
  );
  assert.ok(calls.every((c) => c.init?.redirect === "error"));
});
test("REST adapter handles 200 permission errors, 429, malformed IDs and documented pagination envelopes", async () => {
  for (const [response, expected] of [
    [Response.json({ code: 200100 }), "permission"],
    [
      new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      "rate_limited",
    ],
    [Response.json({ memberUserId: "oops" }), "invalid_response"],
  ] as const) {
    const adapter = new LoftyProvider(
      { clientId: "x", clientSecret: "x", callbackUrl: "https://app.example" },
      async () => response,
    );
    await assert.rejects(
      adapter.identity("token"),
      (e) => e instanceof ProviderError && e.code === expected,
    );
  }
  for (const metadata of ["_metadata", "get_metadata"]) {
    const adapter = new LoftyProvider(
      { clientId: "x", clientSecret: "x", callbackUrl: "https://app.example" },
      async () =>
        Response.json({
          [metadata]: { total: 1, offset: 0, limit: 100 },
          leads: [
            { lead: { leadId: "123", teamId: "456", assignedUserId: "789" } },
          ],
        }),
    );
    const page = await adapter.leads("token", "789", 0);
    assert.equal(page.nextOffset, null);
    assert.equal(page.records[0].externalId, "123");
  }
  assert.throws(() =>
    proposalSchema.parse({
      operation: "notes.create",
      leadId: "123",
      content: "x".repeat(2001),
    }),
  );
  assert.throws(() =>
    proposalSchema.parse({
      operation: "tasks.create",
      leadId: "123",
      content: "Call",
      endAt: "tomorrow",
    }),
  );
});
test("adapter maps timeline channel metadata and exact note UTC revisions", () => {
  const row = mapRecord("activity", {
    id: "123",
    leadId: "456",
    channel: "Call",
    communicationType: "Logged",
    direction: "Inbound",
    note: "Customer called their agent",
    activityTime: "2026-10-22T12:00:00Z",
  });
  assert.equal(row.data.channel, "Call");
  assert.equal(row.data.note, "Customer called their agent");
  assert.equal(
    mapRecord("note", {
      noteId: "123",
      leadId: "456",
      content: "Updated",
      lastUpdate: "2026-10-22 12:30:00",
    }).sourceUpdatedAt,
    "2026-10-22T12:30:00.000Z",
  );
  assert.equal(
    mapRecord("lead", {
      leadId: "123",
      assignedUserId: "456",
      teamId: "789",
      lastUpdateTime: "2026-10-22 12:30:00",
      leadPropertyList: [{ id: "100", listingId: "MLS-ABC" }],
    }).sourceUpdatedAt,
    null,
  );
});
test("bounded AI context preserves lead and note context even with a large activity history", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    connectionId: "test",
    kind: "activity" as const,
    externalId: String(i + 1),
    leadId: "500",
    data: { note: "Recorded CRM activity" },
    hash: "x",
    sourceUpdatedAt: null,
    observedAt: new Date().toISOString(),
    scanId: null,
    status: "active",
  }));
  const context = buildSharedContext(
    [
      ...rows,
      {
        ...rows[0],
        kind: "lead",
        externalId: "500",
        data: { firstName: "Test client" },
      },
      {
        ...rows[0],
        kind: "note",
        externalId: "501",
        data: { content: "Confirmed preparation context" },
      },
    ],
    null,
    null,
  );
  const input = providerWorkInput(context, "");
  assert.equal(input.sources[0].kind, "lead");
  assert.ok(input.sources.some((s) => s.kind === "note"));
  assert.equal(input.sources.filter((s) => s.kind === "activity").length, 20);
  assert.equal(input.coverage.omittedRecords, 130);
});
