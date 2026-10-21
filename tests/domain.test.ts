import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, type Socket } from "node:net";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { closeDatabase, getDatabase, probeReadiness } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";
import * as tables from "../src/lib/db/schema";
import {
  createConversationPackage,
  DomainError,
  getWorkspace,
  reviewPackage,
  updateAgentStyle,
  updateTask,
  type GeneratedPackage,
} from "../src/lib/repository";

let temporaryDirectory: string;
before(async () => {
  // An ordinary DATABASE_URL is never used by tests. PostgreSQL requires an explicit
  // localhost-only disposable test database, and it must contain no workspace data.
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl) {
    const address = new URL(testDatabaseUrl);
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname),
      "TEST_DATABASE_URL must point to a local disposable database.",
    );
    assert.match(
      address.pathname,
      /^\/agentdesk_test_[a-z0-9_]+$/,
      "The disposable database name must begin with agentdesk_test_.",
    );
    process.env.DATABASE_URL = testDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "agentdesk-domain-"),
    );
    process.env.PGLITE_DATA_DIR = temporaryDirectory;
  }
  delete process.env.AGENTDESK_SKIP_AUTO_SEED;
  Object.assign(process.env, { NODE_ENV: "test" });
  const { db } = await getDatabase();
  if (testDatabaseUrl) {
    assert.equal(
      (await db.select().from(tables.workspaces)).length,
      0,
      "PostgreSQL integration tests require an empty disposable database.",
    );
    await seedDatabase(db);
  }
});
after(async () => {
  await closeDatabase();
  if (
    temporaryDirectory &&
    path.basename(temporaryDirectory).startsWith("agentdesk-domain-") &&
    path.dirname(temporaryDirectory) === path.resolve(os.tmpdir())
  )
    await rm(temporaryDirectory, { recursive: true, force: true });
});

const generated = (
  kinds: Array<"summary" | "crm_note" | "message" | "task" | "listing_update">,
): GeneratedPackage => ({
  summary: "Sarah requested a preparation checklist.",
  facts: [
    {
      text: "Sarah requested a checklist.",
      certainty: "requested",
      sourceQuote: "Please send the checklist.",
    },
  ],
  clarifications: [],
  actions: kinds.map((kind, index) => ({
    kind,
    title: `Test ${kind} ${index}`,
    body: `${kind}: Sarah requested a preparation checklist.`,
    dueDate: kind === "task" ? "2026-10-23" : null,
    sourceQuote: "Please send the checklist.",
    certainty: "requested",
  })),
});
const conversationInput = {
  agentId: "jordan",
  clientId: "sarah",
  propertyId: "willow",
  title: "Checklist conversation",
  transcript: "Sarah said: Please send the checklist.",
  source: "note" as const,
};
const domainError = (code: string) => (error: unknown) =>
  error instanceof DomainError && error.code === code;

test("sample workspace is coherent and seed preserves saved records", async () => {
  const workspace = await getWorkspace();
  assert.equal(workspace.agents.length, 6);
  assert.equal(workspace.workspace.referenceDate, "2026-10-21");
  assert.equal(workspace.packages.length, 3);
  assert.equal(
    workspace.appointments.filter(
      (appointment) =>
        appointment.agentId === "jordan" &&
        appointment.startsAt.startsWith("2026-10-21"),
    ).length,
    3,
  );
  assert.equal(
    workspace.appointments.some((appointment) =>
      /photograph/i.test(appointment.title),
    ),
    false,
  );
  assert.equal(
    workspace.packages.every((pkg) => pkg.origin === "sample"),
    true,
  );
  for (const property of workspace.properties)
    assert.equal(
      workspace.clients.find((client) => client.id === property.clientId)
        ?.agentId,
      property.agentId,
    );
  const { db } = await getDatabase();
  assert.equal(await seedDatabase(db), false);
  assert.equal((await getWorkspace()).tasks.length, workspace.tasks.length);
});

test("review applies edited content atomically with correct client/property linkage and never sends", async () => {
  const before = await getWorkspace();
  const pkg = before.packages.find((item) => item.id === "package-sarah")!;
  const decisions = pkg.actions.map((action) => ({
    id: action.id,
    status: "approved" as const,
    body:
      action.kind === "message"
        ? "Hey Sarah, I’ll confirm photography before we set a time."
        : action.body,
    title: action.title,
    dueDate: action.dueDate,
  }));
  const result = await reviewPackage(pkg.id, { decisions });
  assert.equal(
    result.packages.find((item) => item.id === pkg.id)?.status,
    "reviewed",
  );
  assert.equal(result.tasks.length, before.tasks.length + 2);
  const newTasks = result.tasks.filter(
    (item) => !before.tasks.some((existing) => existing.id === item.id),
  );
  assert.ok(
    newTasks.every(
      (task) =>
        task.agentId === "jordan" &&
        task.clientId === "sarah" &&
        task.propertyId === "willow",
    ),
  );
  assert.equal(
    result.tasks.find((task) => task.id === "task-sarah-review")?.status,
    "done",
  );
  assert.equal(
    result.clients.find((client) => client.id === "sarah")!.notes.length,
    before.clients.find((client) => client.id === "sarah")!.notes.length + 1,
  );
  assert.equal(
    result.properties.find((property) => property.id === "willow")!.notes
      .length,
    before.properties.find((property) => property.id === "willow")!.notes
      .length + 1,
  );
  assert.deepEqual(result.appointments, before.appointments);
  assert.deepEqual(
    result.clients.find((client) => client.id === "robert"),
    before.clients.find((client) => client.id === "robert"),
  );
  const { db } = await getDatabase();
  const messages = await db.select().from(tables.approvedMessages);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, "approved");
  assert.equal(
    messages[0].body,
    "Hey Sarah, I’ll confirm photography before we set a time.",
  );
  assert.equal(result.capabilities.externalSend, false);
  assert.equal(result.capabilities.crmSync, false);
  assert.match(
    result.activities.find((activity) => activity.kind === "message_approved")!
      .detail,
    /Not sent/,
  );
});

test("concurrent duplicate approval creates exactly one task and one audit event", async () => {
  const { package: pkg } = await createConversationPackage(
    conversationInput,
    generated(["task"]),
  );
  const input = {
    decisions: [
      {
        id: pkg.actions[0].id,
        status: "approved" as const,
        body: "Edited checklist task.",
        title: "Prepare checklist",
        dueDate: "2026-10-23",
      },
    ],
  };
  await Promise.all([
    reviewPackage(pkg.id, input),
    reviewPackage(pkg.id, input),
    reviewPackage(pkg.id, input),
  ]);
  const { db } = await getDatabase();
  assert.equal(
    (
      await db
        .select()
        .from(tables.tasks)
        .where(eq(tables.tasks.sourceActionId, pkg.actions[0].id))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(tables.activities)
        .where(eq(tables.activities.sourceActionId, pkg.actions[0].id))
    ).length,
    1,
  );
  await assert.rejects(
    reviewPackage(pkg.id, {
      decisions: [
        { ...input.decisions[0], body: "A different task after approval." },
      ],
    }),
    domainError("ALREADY_REVIEWED"),
  );
});

test("rejecting actions has no client, property, task, message or appointment effects", async () => {
  const { package: pkg } = await createConversationPackage(
    conversationInput,
    generated(["crm_note", "message", "task", "listing_update"]),
  );
  const before = await getWorkspace();
  const result = await reviewPackage(pkg.id, {
    decisions: pkg.actions.map((action) => ({
      id: action.id,
      status: "rejected",
      body: action.body,
    })),
  });
  assert.deepEqual(result.clients, before.clients);
  assert.deepEqual(result.properties, before.properties);
  assert.deepEqual(result.tasks, before.tasks);
  assert.deepEqual(result.appointments, before.appointments);
  assert.equal(
    result.packages.find((item) => item.id === pkg.id)?.status,
    "reviewed",
  );
  assert.ok(
    result.packages
      .find((item) => item.id === pkg.id)!
      .actions.every((action) => action.status === "rejected"),
  );
});

test("individual action review leaves remaining work pending and keeps edited task fields", async () => {
  const { package: pkg } = await createConversationPackage(
    conversationInput,
    generated(["task", "crm_note"]),
  );
  const partial = await reviewPackage(pkg.id, {
    decisions: [
      {
        id: pkg.actions[0].id,
        status: "approved",
        body: "Prepare the checklist for Sarah to review.",
        title: "Prepare Sarah’s checklist",
        dueDate: "2026-10-24",
      },
    ],
  });
  const savedPackage = partial.packages.find((item) => item.id === pkg.id)!;
  assert.equal(savedPackage.status, "pending");
  assert.equal(savedPackage.actions[0].status, "approved");
  assert.equal(savedPackage.actions[1].status, "pending");
  const task = partial.tasks.find(
    (item) => item.title === "Prepare Sarah’s checklist",
  )!;
  assert.equal(task.detail, "Prepare the checklist for Sarah to review.");
  assert.equal(task.dueDate, "2026-10-24");
  const complete = await reviewPackage(pkg.id, {
    decisions: [
      { id: pkg.actions[1].id, status: "rejected", body: pkg.actions[1].body },
    ],
  });
  assert.equal(
    complete.packages.find((item) => item.id === pkg.id)!.status,
    "reviewed",
  );
});

test("invalid action prevents every write in a mixed review", async () => {
  const { package: pkg } = await createConversationPackage(
    conversationInput,
    generated(["crm_note", "task"]),
  );
  const before = await getWorkspace();
  await assert.rejects(
    reviewPackage(pkg.id, {
      decisions: [
        {
          id: pkg.actions[0].id,
          status: "approved",
          body: "Must never be saved.",
        },
        {
          id: "action-from-another-package",
          status: "approved",
          body: "Must not be accepted.",
        },
      ],
    }),
    domainError("INVALID_LINK"),
  );
  const after = await getWorkspace();
  assert.deepEqual(after.clients, before.clients);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.activities, before.activities);
  assert.equal(
    after.packages.find((item) => item.id === pkg.id)?.actions[0].status,
    "pending",
  );
});

test("a database constraint failure rolls back earlier changes in the approval transaction", async () => {
  const { package: pkg } = await createConversationPackage(
    conversationInput,
    generated(["crm_note", "message"]),
  );
  const { db } = await getDatabase();
  await db.insert(tables.approvedMessages).values({
    id: "constraint-fixture",
    workspaceId: "willow-collective",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    sourceActionId: pkg.actions[1].id,
    subject: "Existing fixture",
    body: "Simulated conflicting record",
    status: "approved",
  });
  const before = await getWorkspace();
  await assert.rejects(
    reviewPackage(pkg.id, {
      decisions: pkg.actions.map((action) => ({
        id: action.id,
        status: "approved",
        body: action.body,
      })),
    }),
  );
  const after = await getWorkspace();
  assert.deepEqual(after.clients, before.clients);
  assert.deepEqual(after.activities, before.activities);
  assert.ok(
    after.packages
      .find((item) => item.id === pkg.id)!
      .actions.every((action) => action.status === "pending"),
  );
  await db
    .delete(tables.approvedMessages)
    .where(eq(tables.approvedMessages.id, "constraint-fixture"));
});

test("missing records, cross-tenant writes and mismatched entity links are rejected", async () => {
  const before = await getWorkspace();
  await assert.rejects(updateTask("missing", "done"), domainError("NOT_FOUND"));
  await assert.rejects(
    reviewPackage("missing", {
      decisions: [{ id: "missing", status: "approved", body: "No record." }],
    }),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    updateTask("task-willow-disclosure", "done", {
      workspaceId: "another-brokerage",
    }),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    updateAgentStyle("jordan", before.agents[0].style, {
      workspaceId: "another-brokerage",
    }),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    createConversationPackage(
      { ...conversationInput, clientId: "robert" },
      generated(["task"]),
    ),
    domainError("INVALID_LINK"),
  );
  await assert.rejects(
    createConversationPackage(
      { ...conversationInput, propertyId: "oak" },
      generated(["task"]),
    ),
    domainError("INVALID_LINK"),
  );
  await assert.rejects(
    createConversationPackage(conversationInput, generated(["task"]), {
      workspaceId: "another-brokerage",
    }),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    createConversationPackage(
      { ...conversationInput, propertyId: null },
      generated(["listing_update"]),
    ),
    domainError("INVALID_INPUT"),
  );
  assert.equal(
    (await getWorkspace()).conversations.length,
    before.conversations.length,
  );
});

test("an existing second tenant cannot be read or mutated through the sample scope", async () => {
  const { db } = await getDatabase();
  const sample = await getWorkspace();
  await db.insert(tables.workspaces).values({
    id: "second-tenant",
    name: "Separate brokerage",
    sample: false,
    referenceDate: "2026-10-21",
  });
  await db.insert(tables.agents).values({
    ...sample.agents[0],
    id: "private-agent",
    workspaceId: "second-tenant",
    name: "Private Agent",
  });
  await db.insert(tables.clients).values({
    ...sample.clients[0],
    id: "private-client",
    workspaceId: "second-tenant",
    agentId: "private-agent",
    name: "Private Client",
  });
  await db.insert(tables.tasks).values({
    id: "private-task",
    workspaceId: "second-tenant",
    agentId: "private-agent",
    clientId: "private-client",
    title: "Private tenant task",
    detail: "Must stay in its workspace.",
    dueDate: null,
    status: "open",
    priority: "normal",
    source: "Test fixture",
  });
  const scoped = await getWorkspace();
  assert.equal(
    scoped.agents.some((agent) => agent.id === "private-agent"),
    false,
  );
  assert.equal(
    scoped.clients.some((client) => client.id === "private-client"),
    false,
  );
  assert.equal(
    scoped.tasks.some((task) => task.id === "private-task"),
    false,
  );
  await assert.rejects(
    updateTask("private-task", "done"),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    updateAgentStyle("private-agent", sample.agents[0].style),
    domainError("NOT_FOUND"),
  );
  await assert.rejects(
    createConversationPackage(
      { ...conversationInput, clientId: "private-client" },
      generated(["task"]),
    ),
    domainError("INVALID_LINK"),
  );
  await assert.rejects(
    db.insert(tables.tasks).values({
      id: "invalid-tenant-task",
      workspaceId: "willow-collective",
      agentId: "private-agent",
      title: "Invalid tenant link",
      detail: "Must fail the composite foreign key.",
      dueDate: null,
      status: "open",
      priority: "normal",
      source: "Test fixture",
    }),
  );
  assert.equal(
    (await getWorkspace({ workspaceId: "second-tenant" })).tasks[0].status,
    "open",
  );
});

test("task completion is idempotent and style and task changes survive reopening the database", async () => {
  const before = await getWorkspace();
  const first = await updateTask("task-willow-disclosure", "done");
  const second = await updateTask("task-willow-disclosure", "done");
  assert.equal(second.activities.length, first.activities.length);
  await updateAgentStyle("jordan", {
    ...before.agents.find((agent) => agent.id === "jordan")!.style,
    tone: "Warm and brief; saved persistence test.",
  });
  await closeDatabase();
  const reopened = await getWorkspace();
  assert.equal(
    reopened.tasks.find((task) => task.id === "task-willow-disclosure")!.status,
    "done",
  );
  assert.equal(
    reopened.agents.find((agent) => agent.id === "jordan")!.style.tone,
    "Warm and brief; saved persistence test.",
  );
  assert.equal(
    reopened.packages.find((pkg) => pkg.id === "package-sarah")!.status,
    "reviewed",
  );
});

test(
  "production initialization and readiness do not wait on the migration advisory lock",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    await closeDatabase();
    const lockClient = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
      connectionTimeoutMillis: 2_500,
    });
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock(741852963)");
    Object.assign(process.env, { NODE_ENV: "production" });
    const started = performance.now();
    try {
      const { db } = await getDatabase();
      await db.execute(sql`SELECT 1`);
      assert.equal((await probeReadiness()).storage, "postgresql");
      assert.ok(
        performance.now() - started < 2_700,
        "Production initialization must not acquire the migration lock.",
      );
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(741852963)");
      await lockClient.end();
      await closeDatabase();
      Object.assign(process.env, { NODE_ENV: "test" });
    }
  },
);

test("readiness fails within its deadline when PostgreSQL accepts TCP but never responds", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `postgresql://test:unused@127.0.0.1:${address.port}/agentdesk_test_timeout`;
  const started = performance.now();
  try {
    await assert.rejects(probeReadiness());
    assert.ok(
      performance.now() - started < 3_000,
      "Readiness must fail before the HTTP health deadline.",
    );
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
