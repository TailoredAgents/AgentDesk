import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { getWorkstyle, changeWorkstyle } from "../src/lib/workstyle/service";
import {
  applyDocumentWorkstyle,
  resolveWorkstyle,
} from "../src/lib/workstyle/engine";
import { SAMPLE_WORKSPACE_ID } from "../src/lib/db/seed-data";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, type Socket } from "node:net";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { closeDatabase, getDatabase, probeReadiness } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";
import { sampleAgents } from "../src/lib/db/seed-data";
import * as tables from "../src/lib/db/schema";
import {
  createConversationPackage,
  DomainError,
  getWorkspace,
  reviewPackage,
  updateAgentStyle,
  updateTask,
  updateCommitment,
  resetSampleWorkspace,
  SAMPLE_RESET_CONFIRMATION,
  findConversationPackageByRequestId,
  createWorkProductDraft,
  findWorkProductByRequestId,
  editWorkProductVersion,
  reviewWorkProductVersion,
  getWorkProductPdf,
  setTaskCalendar,
  type CreateWorkProductInput,
  type GeneratedPackage,
} from "../src/lib/repository";
import { deriveFollowUps } from "../src/lib/follow-ups";
import {
  buildWorkProductSnapshot,
  buildSavedSellerContent,
} from "../src/lib/work-product-content";
import { renderWorkProductPdf } from "../src/lib/work-product-pdf";
import { confirmedTaskSchedule } from "../src/lib/calendar";
import {
  situationSampleObservations,
  situationSampleTranscript,
} from "../src/lib/intelligence-sample";
import {
  activeSituationImpacts,
  proposalImpacts,
  situationImpacts,
} from "../src/lib/intelligence";
import { refreshWorkProduct } from "../src/lib/work-product-content";
import { proposeFactCorrection } from "../src/lib/repository";
import type {
  WorkProduct,
  WorkProductVersion,
} from "../src/lib/work-product-types";

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
  kinds: Array<
    "summary" | "crm_note" | "message" | "task" | "listing_update" | "question"
  >,
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
  assert.equal(
    new Set(workspace.agents.map((agent) => agent.style.examples)).size,
    6,
  );
  for (const [agentId, name] of Object.entries({
    jordan: "Sarah",
    olivia: "Robert",
    marcus: "Emily",
    sophie: "Noah",
    daniel: "Ava",
    maya: "Grace",
  }))
    assert.ok(
      workspace.agents
        .find((agent) => agent.id === agentId)!
        .style.examples.includes(name),
    );
  assert.equal(workspace.workspace.referenceDate, "2026-10-23");
  assert.equal(workspace.packages.length, 5);
  const patioProposal = workspace.packages
    .find((pkg) => pkg.id === "package-sarah")!
    .actions.find((action) => action.kind === "question")!;
  assert.ok(patioProposal);
  assert.equal(patioProposal.status, "pending");
  assert.ok(
    workspace.conversations
      .find((item) => item.id === "conversation-sarah")!
      .transcript.includes(patioProposal.sourceQuote),
  );
  assert.equal(
    workspace.commitments.some(
      (item) => item.sourceActionId === patioProposal.id,
    ),
    false,
  );
  assert.equal(
    workspace.appointments.filter(
      (appointment) =>
        appointment.agentId === "jordan" &&
        appointment.startsAt.startsWith("2026-10-23"),
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
  for (const clientId of ["sarah", "michael", "emily"]) {
    const recommendation = workspace.recommendations.find(
      (item) => item.clientId === clientId,
    )!;
    assert.equal(recommendation.status, "ready_for_review");
    assert.ok(recommendation.evidence.length > 0);
    assert.ok(recommendation.packageId);
  }
  assert.equal(
    workspace.recommendations.find((item) => item.clientId === "michael")!
      .urgency,
    "overdue",
  );
  assert.equal(
    workspace.recommendations.find((item) => item.clientId === "sarah")!
      .dueDate,
    "2026-10-23",
  );
  assert.equal(
    workspace.recommendations.find((item) => item.clientId === "emily")!
      .urgency,
    "unresolved",
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
  const audit = result.reviewHistory.find(
    (item) => item.actionId === "sarah-message",
  )!;
  assert.equal(
    audit.original.body,
    pkg.actions.find((action) => action.id === "sarah-message")!.body,
  );
  assert.equal(audit.edited.body, messages[0].body);
  assert.equal(audit.originalAvailable, true);
  assert.equal(
    result.commitments.find(
      (item) => item.id === "commitment-sarah-photography",
    )!.status,
    "open",
  );
  assert.equal(
    result.recommendations.find((item) => item.clientId === "sarah")!.packageId,
    "package-sarah",
    "Approved linked tasks must not create duplicate proactive packages.",
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
  const revision = (await getWorkspace()).workspace.revision!;
  await Promise.all([
    reviewPackage(pkg.id, input),
    reviewPackage(pkg.id, input),
    reviewPackage(pkg.id, input),
  ]);
  assert.equal((await getWorkspace()).workspace.revision, revision + 1);
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
  assert.equal(
    (
      await db
        .select()
        .from(tables.reviewAudits)
        .where(eq(tables.reviewAudits.actionId, pkg.actions[0].id))
    ).length,
    1,
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
  assert.equal(after.workspace.revision, before.workspace.revision);
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
  assert.equal(first.workspace.revision, before.workspace.revision! + 1);
  assert.equal(second.workspace.revision, first.workspace.revision);
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

test("proactive signals are record-based, bounded, and never inferred from silence alone", async () => {
  const state = await getWorkspace();
  const quiet = {
    ...state,
    tasks: state.tasks.map((task) => ({ ...task, status: "done" as const })),
    commitments: state.commitments.map((item) => ({
      ...item,
      status: "resolved" as const,
    })),
  };
  assert.deepEqual(deriveFollowUps(quiet), []);
  const populated = {
    ...state,
    clients: state.clients.map((client) => ({
      ...client,
      notes: ["Context ".repeat(10_000)],
    })),
  };
  assert.ok(
    deriveFollowUps(populated).every(
      (item) => item.sourceSnapshot.length <= 39_000,
    ),
  );
  assert.deepEqual(
    deriveFollowUps(state).map((item) => item.id),
    deriveFollowUps(state).map((item) => item.id),
  );
});

test("conversation request IDs prevent concurrent duplicate packages and reject changed-payload reuse", async () => {
  const before = await getWorkspace();
  const input = { ...conversationInput, requestId: randomUUID() };
  const results = await Promise.all([
    createConversationPackage(input, generated(["message"])),
    createConversationPackage(input, generated(["message"])),
    createConversationPackage(input, generated(["message"])),
  ]);
  assert.equal(new Set(results.map((result) => result.package.id)).size, 1);
  assert.equal(
    (await getWorkspace()).workspace.revision,
    before.workspace.revision! + 1,
  );
  assert.equal(
    (await getWorkspace()).conversations.length,
    before.conversations.length + 1,
  );
  assert.equal(
    (await findConversationPackageByRequestId(input.requestId))!.package.id,
    results[0].package.id,
  );
  assert.equal(
    await findConversationPackageByRequestId(input.requestId, {
      workspaceId: "second-tenant",
    }),
    null,
  );
  await assert.rejects(
    createConversationPackage(
      {
        ...input,
        transcript:
          "Changed content must not reuse a prior submission identifier.",
      },
      generated(["message"]),
    ),
    domainError("REQUEST_CONFLICT"),
  );
});

test("proactive preparation deduplicates by signal and rejects a source completed during generation", async () => {
  const state = await getWorkspace();
  const recommendation = state.recommendations.find(
    (item) => item.clientId === "noah",
  )!;
  assert.equal(recommendation.status, "needs_draft");
  const input = {
    agentId: recommendation.agentId,
    clientId: recommendation.clientId,
    propertyId: recommendation.propertyId,
    title: "Noah follow-up",
    transcript: recommendation.sourceSnapshot,
    source: "followup" as const,
    recommendationId: recommendation.id,
  };
  const results = await Promise.all([
    createConversationPackage(
      { ...input, requestId: randomUUID() },
      generated(["message"]),
    ),
    createConversationPackage(
      { ...input, requestId: randomUUID() },
      generated(["message"]),
    ),
  ]);
  assert.equal(results[0].package.id, results[1].package.id);
  const stale = (await getWorkspace()).recommendations.find(
    (item) => item.clientId === "ava",
  )!;
  await updateTask("task-ava-relocation", "done");
  await assert.rejects(
    createConversationPackage(
      {
        agentId: stale.agentId,
        clientId: stale.clientId,
        propertyId: stale.propertyId,
        title: "Stale follow-up",
        transcript: stale.sourceSnapshot,
        source: "followup",
        recommendationId: stale.id,
      },
      generated(["message"]),
    ),
    domainError("STALE_RECOMMENDATION"),
  );
});

test("approved drafts do not complete work; new signals after completion receive a fresh recommendation", async () => {
  const initial = await getWorkspace();
  const recommendation = initial.recommendations.find(
    (item) => item.clientId === "michael",
  )!;
  const pkg = initial.packages.find(
    (item) => item.id === recommendation.packageId,
  )!;
  await reviewPackage(pkg.id, {
    decisions: [
      { id: pkg.actions[0].id, status: "approved", body: pkg.actions[0].body },
    ],
  });
  const approved = await getWorkspace();
  assert.equal(
    approved.tasks.find((item) => item.id === "task-michael-followup")!.status,
    "open",
  );
  assert.equal(
    approved.recommendations.find((item) => item.clientId === "michael")!
      .status,
    "approved_draft",
  );
  await updateTask("task-michael-followup", "done");
  assert.equal(
    (await getWorkspace()).recommendations.some(
      (item) => item.clientId === "michael",
    ),
    false,
  );
  const newWork = await createConversationPackage(
    {
      ...conversationInput,
      clientId: "michael",
      propertyId: null,
      title: "Michael’s new question",
    },
    {
      ...generated(["task"]),
      actions: [
        {
          ...generated(["task"]).actions[0],
          title: "Follow up on Michael’s new commute question",
          body: "Michael asked a new question about the commute. Follow up with him.",
          dueDate: "2026-10-26",
        },
      ],
    },
  );
  await reviewPackage(newWork.package.id, {
    decisions: [
      {
        id: newWork.package.actions[0].id,
        status: "approved",
        body: newWork.package.actions[0].body,
      },
    ],
  });
  const next = (await getWorkspace()).recommendations.find(
    (item) => item.clientId === "michael",
  )!;
  assert.notEqual(next.id, recommendation.id);
  assert.equal(next.status, "needs_draft");
  assert.equal(next.packageId, null);
});

test("explicit commitment resolution and reopening update recommendations without changing drafts", async () => {
  const before = await getWorkspace();
  assert.ok(before.recommendations.find((item) => item.clientId === "emily"));
  const resolved = await updateCommitment(
    "commitment-emily-question",
    "resolved",
  );
  assert.equal(
    resolved.recommendations.some((item) => item.clientId === "emily"),
    false,
  );
  assert.deepEqual(resolved.packages, before.packages);
  const reopened = await updateCommitment("commitment-emily-question", "open");
  assert.equal(
    reopened.recommendations.find((item) => item.clientId === "emily")!
      .packageId,
    "package-emily-question",
  );
  await assert.rejects(
    updateCommitment("commitment-emily-question", "resolved", {
      workspaceId: "second-tenant",
    }),
    domainError("NOT_FOUND"),
  );
});

test("sample restore is explicit, sample-only, atomic and leaves another tenant intact", async () => {
  const beforeRestore = await getWorkspace();
  const pendingRecommendation = beforeRestore.recommendations.find(
    (item) => item.clientId === "michael",
  )!;
  const other = await getWorkspace({ workspaceId: "second-tenant" });
  await assert.rejects(
    resetSampleWorkspace("yes"),
    domainError("CONFIRMATION_REQUIRED"),
  );
  await assert.rejects(
    resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION, {
      workspaceId: "second-tenant",
    }),
    domainError("SAMPLE_ONLY"),
  );
  const { db } = await getDatabase();
  await db
    .update(tables.workspaces)
    .set({ sample: false })
    .where(eq(tables.workspaces.id, "willow-collective"));
  await assert.rejects(
    resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION),
    domainError("SAMPLE_ONLY"),
  );
  await db
    .update(tables.workspaces)
    .set({ sample: true })
    .where(eq(tables.workspaces.id, "willow-collective"));
  const restored = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  assert.equal(restored.packages.length, 5);
  assert.equal(
    restored.packages.every(
      (item) => item.status === "pending" && item.origin === "sample",
    ),
    true,
  );
  assert.equal(restored.reviewHistory.length, 0);
  assert.equal(
    restored.tasks.find((item) => item.id === "task-michael-followup")!.status,
    "open",
  );
  assert.deepEqual(await getWorkspace({ workspaceId: "second-tenant" }), other);
  assert.equal(
    restored.activities.filter((item) => item.kind === "sample_reset").length,
    1,
  );
  assert.equal(
    restored.workspace.revision,
    (beforeRestore.workspace.revision ?? 0) + 1,
  );
  await assert.rejects(
    createConversationPackage(
      {
        ...conversationInput,
        expectedWorkspaceRevision: beforeRestore.workspace.revision ?? 0,
      },
      generated(["message"]),
    ),
    domainError("WORKSPACE_CHANGED"),
  );
  await assert.rejects(
    createConversationPackage(
      {
        agentId: pendingRecommendation.agentId,
        clientId: pendingRecommendation.clientId,
        propertyId: pendingRecommendation.propertyId,
        title: "Follow-up prepared before reset",
        source: "followup",
        recommendationId: pendingRecommendation.id,
        transcript: pendingRecommendation.sourceSnapshot,
      },
      generated(["message"]),
    ),
    domainError("STALE_RECOMMENDATION"),
  );
});

test("versioned sample additions preserve existing edits, decisions and audit history", async () => {
  const state = await getWorkspace();
  const pkg = state.packages.find(
    (item) => item.id === "package-michael-followup",
  )!;
  await reviewPackage(pkg.id, {
    decisions: [
      {
        id: pkg.actions[0].id,
        status: "approved",
        body: "An intentionally edited buyer draft.",
      },
    ],
  });
  await updateTask("task-willow-disclosure", "done");
  const daniel = state.agents.find((agent) => agent.id === "daniel")!;
  const maya = state.agents.find((agent) => agent.id === "maya")!;
  await updateAgentStyle("daniel", {
    ...daniel.style,
    examples: sampleAgents.find((agent) => agent.id === "jordan")!.style
      .examples,
  });
  await updateAgentStyle("maya", {
    ...maya.style,
    examples: "My intentionally customized client example.",
  });
  const before = await getWorkspace();
  const { db } = await getDatabase();
  await db
    .update(tables.workspaces)
    .set({ sampleVersion: 3 })
    .where(eq(tables.workspaces.id, "willow-collective"));
  await seedDatabase(db);
  const after = await getWorkspace();
  assert.deepEqual(after.packages, before.packages);
  assert.deepEqual(after.reviewHistory, before.reviewHistory);
  assert.deepEqual(after.clients, before.clients);
  assert.deepEqual(after.tasks, before.tasks);
  assert.equal(
    after.agents.find((agent) => agent.id === "daniel")!.style.examples,
    sampleAgents.find((agent) => agent.id === "daniel")!.style.examples,
  );
  assert.equal(
    after.agents.find((agent) => agent.id === "maya")!.style.examples,
    "My intentionally customized client example.",
  );
  assert.equal(after.workspace.revision, before.workspace.revision! + 1);
  await seedDatabase(db);
  assert.equal(
    (await getWorkspace()).workspace.revision,
    after.workspace.revision,
  );
});

test("concurrent mutations publish coherent monotonic snapshots and invalidate outdated AI context", async () => {
  const before = await getWorkspace();
  const revision = before.workspace.revision!;
  const style = {
    ...before.agents.find((agent) => agent.id === "daniel")!.style,
    tone: "A distinct concurrency-test style.",
  };
  const snapshots = await Promise.all([
    updateTask("task-willow-disclosure", "open"),
    updateAgentStyle("daniel", style),
    updateCommitment("commitment-emily-question", "resolved"),
    getWorkspace(),
    getWorkspace(),
  ]);
  for (const snapshot of snapshots) {
    const committedChanges =
      Number(
        snapshot.tasks.find((task) => task.id === "task-willow-disclosure")!
          .status === "open",
      ) +
      Number(
        snapshot.agents.find((agent) => agent.id === "daniel")!.style.tone ===
          style.tone,
      ) +
      Number(
        snapshot.commitments.find(
          (item) => item.id === "commitment-emily-question",
        )!.status === "resolved",
      );
    assert.equal(
      snapshot.workspace.revision,
      revision + committedChanges,
      "Each snapshot must contain exactly the mutations committed at its revision.",
    );
  }
  const after = await getWorkspace();
  assert.equal(after.workspace.revision, revision + 3);
  await Promise.all([
    updateTask("task-willow-disclosure", "open"),
    updateAgentStyle("daniel", style),
    updateCommitment("commitment-emily-question", "resolved"),
  ]);
  assert.equal(
    (await getWorkspace()).workspace.revision,
    after.workspace.revision,
    "Retries with unchanged data must not advance the revision.",
  );
  await assert.rejects(
    createConversationPackage(
      { ...conversationInput, expectedWorkspaceRevision: revision },
      generated(["message"]),
    ),
    domainError("WORKSPACE_CHANGED"),
  );
  const input = {
    ...conversationInput,
    requestId: randomUUID(),
    expectedWorkspaceRevision: after.workspace.revision,
  };
  const created = await createConversationPackage(
    input,
    generated(["message"]),
  );
  assert.equal((await getWorkspace()).workspace.revision, revision + 4);
  const retried = await createConversationPackage(
    input,
    generated(["message"]),
  );
  assert.equal(
    retried.package.id,
    created.package.id,
    "A successful duplicate request remains idempotent even after its expected revision becomes old.",
  );
  assert.equal((await getWorkspace()).workspace.revision, revision + 4);
});

const sellerLinks = {
  kind: "seller_preparation" as const,
  agentId: "jordan",
  clientId: "sarah",
  propertyId: "willow",
  appointmentId: null,
  sourceConversationId: "conversation-sarah",
  sourcePackageId: "package-sarah",
};
async function sellerDraft(
  overrides: Partial<CreateWorkProductInput> = {},
): Promise<CreateWorkProductInput> {
  const state = await getWorkspace();
  const snapshot = buildWorkProductSnapshot(state, sellerLinks);
  return {
    ...sellerLinks,
    requestId: randomUUID(),
    requestFingerprint: "a".repeat(64),
    content: buildSavedSellerContent(snapshot),
    snapshot,
    origin: "sample",
    expectedWorkspaceRevision: state.workspace.revision!,
    ...overrides,
  };
}
async function pdfFor(
  product: WorkProduct,
  version: WorkProductVersion,
  content = version.content,
) {
  const bytes = await renderWorkProductPdf({
    productId: product.id,
    kind: product.kind,
    version: version.version,
    content,
    snapshot: version.snapshot,
    createdAt: version.createdAt,
  });
  return {
    pdfBase64: bytes.toString("base64"),
    pdfSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
test("saved seller work product retains linked sources and a clearly pending sample without a PDF", async () => {
  const state = await getWorkspace();
  const product = state.workProducts.find(
    (item) => item.id === "product-sarah-preparation",
  )!;
  assert.equal(product.agentId, "jordan");
  assert.equal(product.clientId, "sarah");
  assert.equal(product.propertyId, "willow");
  assert.equal(product.sourcePackageId, "package-sarah");
  const version = product.versions[0];
  assert.equal(version.origin, "sample");
  assert.equal(version.status, "pending");
  assert.equal(version.hasPdf, false);
  assert.equal(version.history[0].event, "created");
  assert.deepEqual(version.content, version.originalContent);
  for (const section of version.content.sections)
    for (const item of section.items) {
      if (item.certainty === "general") {
        assert.equal(item.sourceId, null);
        assert.equal(item.sourceQuote, null);
      } else
        assert.ok(
          version.snapshot.sources
            .find((source) => source.id === item.sourceId)
            ?.text.includes(item.sourceQuote!),
        );
    }
  await assert.rejects(
    getWorkProductPdf(product.id, version.id),
    domainError("NOT_FOUND"),
  );
});
test("work product creation is scoped, source-verified, stale-safe, and request-idempotent under concurrency", async () => {
  const input = await sellerDraft();
  const results = await Promise.all([
    createWorkProductDraft(input),
    createWorkProductDraft(input),
    createWorkProductDraft(input),
  ]);
  assert.equal(new Set(results.map((item) => item.versionId)).size, 1);
  assert.equal(
    (await getWorkspace()).workspace.revision,
    input.expectedWorkspaceRevision + 1,
  );
  assert.deepEqual(await findWorkProductByRequestId(input.requestId), {
    productId: results[0].productId,
    versionId: results[0].versionId,
    requestFingerprint: input.requestFingerprint,
  });
  assert.equal(
    await findWorkProductByRequestId(input.requestId, {
      workspaceId: "second-tenant",
    }),
    null,
  );
  await assert.rejects(
    createWorkProductDraft({ ...input, requestFingerprint: "b".repeat(64) }),
    domainError("REQUEST_CONFLICT"),
  );
  await assert.rejects(
    createWorkProductDraft({ ...input, propertyId: "oak" }),
    domainError("REQUEST_CONFLICT"),
  );
  await assert.rejects(
    createWorkProductDraft(await sellerDraft({ propertyId: "oak" })),
    domainError("INVALID_LINK"),
  );
  const forged = await sellerDraft();
  forged.snapshot.agent.name = "A different person";
  await assert.rejects(
    createWorkProductDraft(forged),
    domainError("STALE_SOURCE"),
  );
  const stale = await sellerDraft();
  const data = await getWorkspace();
  await updateAgentStyle("jordan", {
    ...data.agents.find((item) => item.id === "jordan")!.style,
    signoff: "A changed profile while preparing.",
  });
  await assert.rejects(
    createWorkProductDraft(stale),
    domainError("WORKSPACE_CHANGED"),
  );
  await assert.rejects(
    createWorkProductDraft(await sellerDraft(), {
      workspaceId: "second-tenant",
    }),
    domainError("WORKSPACE_CHANGED"),
  );
});
test("concurrent draft edits preserve the original and reject conflicting or fabricated citations", async () => {
  const input = await sellerDraft();
  const created = await createWorkProductDraft(input);
  const a = {
    ...input.content,
    introduction:
      "Sarah, please review this edited preparation guide with Jordan before making arrangements.",
  };
  const b = {
    ...input.content,
    introduction:
      "Sarah, this competing edit must not overwrite another saved change.",
  };
  const edits = await Promise.allSettled([
    editWorkProductVersion(created.productId, created.versionId, {
      content: a,
      expectedEditRevision: 0,
    }),
    editWorkProductVersion(created.productId, created.versionId, {
      content: b,
      expectedEditRevision: 0,
    }),
  ]);
  assert.equal(edits.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    edits.filter(
      (item) =>
        item.status === "rejected" && domainError("EDIT_CONFLICT")(item.reason),
    ).length,
    1,
  );
  const state = await getWorkspace();
  const version = state.workProducts.find(
    (item) => item.id === created.productId,
  )!.versions[0];
  assert.equal(version.editRevision, 1);
  assert.deepEqual(version.originalContent, input.content);
  assert.deepEqual(
    version.history.map((item) => item.event),
    ["created", "edited"],
  );
  const forged = structuredClone(version.content);
  forged.sections[0].items[0].sourceQuote = "This quote was never recorded.";
  await assert.rejects(
    editWorkProductVersion(created.productId, version.id, {
      content: forged,
      expectedEditRevision: 1,
    }),
  );
  await assert.rejects(
    editWorkProductVersion(
      created.productId,
      version.id,
      { content: a, expectedEditRevision: 1 },
      { workspaceId: "second-tenant" },
    ),
    domainError("NOT_FOUND"),
  );
  assert.equal(
    (await getWorkspace()).workspace.revision,
    state.workspace.revision,
  );
});
test("document history follows revisions and lifecycle despite reversed audit timestamps", async () => {
  const input = await sellerDraft();
  const created = await createWorkProductDraft(input);
  const edited = {
    ...input.content,
    introduction:
      "Sarah, please review this guide and its open questions with Jordan.",
  };
  await editWorkProductVersion(created.productId, created.versionId, {
    content: edited,
    expectedEditRevision: 0,
  });
  await reviewWorkProductVersion(created.productId, created.versionId, {
    decision: "rejected",
    content: edited,
    expectedEditRevision: 1,
  });
  const { db } = await getDatabase();
  await db
    .update(tables.workProductAudits)
    .set({
      createdAt: sql`(CASE ${tables.workProductAudits.event}
      WHEN 'created' THEN '2099-01-03T00:00:00.000Z'
      WHEN 'edited' THEN '2099-01-02T00:00:00.000Z'
      ELSE '2099-01-01T00:00:00.000Z' END)::timestamptz`,
    })
    .where(eq(tables.workProductAudits.versionId, created.versionId));
  const version = (await getWorkspace()).workProducts.find(
    (item) => item.id === created.productId,
  )!.versions[0];
  assert.deepEqual(
    version.history.map(({ event, editRevision }) => ({ event, editRevision })),
    [
      { event: "created", editRevision: 0 },
      { event: "edited", editRevision: 1 },
      { event: "rejected", editRevision: 1 },
    ],
  );
  assert.deepEqual(version.history[0].content, input.content);
  assert.deepEqual(version.history[1].content, edited);
});
test("PDF approval is atomic, durable, idempotent, and immutable across new versions", async () => {
  const created = await createWorkProductDraft(await sellerDraft());
  const parent = created.workspace.workProducts.find(
    (item) => item.id === created.productId,
  )!;
  const version = parent.versions[0];
  const edited = {
    ...version.content,
    introduction:
      "Sarah, Jordan has reviewed this personalized guide. Please use it to prepare and raise any outstanding questions.",
  };
  const pdf = await pdfFor(parent, version, edited);
  assert.ok(Buffer.from(pdf.pdfBase64, "base64").length > 5000);
  const decision = {
    decision: "approved" as const,
    expectedEditRevision: 0,
    content: edited,
    ...pdf,
  };
  const { db } = await getDatabase();
  await db.execute(
    sql`ALTER TABLE work_product_versions ADD CONSTRAINT test_block_approval CHECK(status <> 'approved') NOT VALID`,
  );
  try {
    await assert.rejects(
      reviewWorkProductVersion(parent.id, version.id, decision),
    );
  } finally {
    await db.execute(
      sql`ALTER TABLE work_product_versions DROP CONSTRAINT test_block_approval`,
    );
  }
  const unchanged = await getWorkspace();
  assert.equal(
    unchanged.workspace.revision,
    created.workspace.workspace.revision,
  );
  assert.deepEqual(
    unchanged.workProducts.find((item) => item.id === parent.id),
    parent,
  );
  await Promise.all([
    reviewWorkProductVersion(parent.id, version.id, decision),
    reviewWorkProductVersion(parent.id, version.id, decision),
  ]);
  const after = await getWorkspace();
  const approved = after.workProducts.find((item) => item.id === parent.id)!
    .versions[0];
  assert.equal(approved.status, "approved");
  assert.equal(approved.hasPdf, true);
  assert.equal(approved.pdfSha256, pdf.pdfSha256);
  assert.equal(approved.editRevision, 1);
  assert.deepEqual(approved.originalContent, version.originalContent);
  assert.deepEqual(
    approved.history.map((item) => item.event),
    ["created", "edited", "approved"],
  );
  assert.equal(
    after.workspace.revision,
    created.workspace.workspace.revision! + 1,
  );
  assert.equal(JSON.stringify(after).includes('"pdfBase64"'), false);
  const bytes = await getWorkProductPdf(parent.id, version.id);
  assert.equal(bytes.pdfBase64, pdf.pdfBase64);
  await closeDatabase();
  assert.equal(
    (await getWorkProductPdf(parent.id, version.id)).pdfBase64,
    pdf.pdfBase64,
  );
  await reviewWorkProductVersion(parent.id, version.id, {
    decision: "approved",
    expectedEditRevision: 0,
    content: edited,
  });
  assert.equal(
    (await getWorkspace()).workspace.revision,
    after.workspace.revision,
  );
  await assert.rejects(
    editWorkProductVersion(parent.id, version.id, {
      content: edited,
      expectedEditRevision: 1,
    }),
    domainError("ALREADY_REVIEWED"),
  );
  await assert.rejects(
    reviewWorkProductVersion(parent.id, version.id, {
      decision: "rejected",
      expectedEditRevision: 1,
    }),
    domainError("ALREADY_REVIEWED"),
  );
  await assert.rejects(
    getWorkProductPdf(parent.id, version.id, { workspaceId: "second-tenant" }),
    domainError("NOT_FOUND"),
  );
  const copy = await createWorkProductDraft(
    await sellerDraft({
      productId: parent.id,
      copyVersionId: approved.id,
      content: approved.content,
    }),
  );
  const versions = copy.workspace.workProducts.find(
    (item) => item.id === parent.id,
  )!.versions;
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 2);
  assert.equal(versions[0].status, "pending");
  assert.deepEqual(versions[1], approved);
  assert.equal(
    (await getWorkProductPdf(parent.id, version.id)).pdfBase64,
    pdf.pdfBase64,
  );
});
test("manual document copies retain historical citations after source records change; regeneration requires fresh evidence", async () => {
  await updateTask("task-willow-staging", "open");
  const input = await sellerDraft();
  const taskSource = input.snapshot.sources.find(
    (source) => source.id === "task:task-willow-staging",
  )!;
  assert.match(taskSource.text, /Status: open/);
  input.content.sections
    .find((section) => section.kind === "next_steps")!
    .items.push({
      text: "Review staging recommendations before preparing the checklist.",
      certainty: "requested",
      sourceId: taskSource.id,
      sourceQuote: taskSource.text,
    });
  const created = await createWorkProductDraft(input);
  const original = created.workspace.workProducts.find(
    (product) => product.id === created.productId,
  )!.versions[0];
  const changed = await updateTask("task-willow-staging", "done");
  const fresh = buildWorkProductSnapshot(changed, sellerLinks);
  assert.equal(
    fresh.sources
      .find((source) => source.id === taskSource.id)!
      .text.includes(taskSource.text),
    false,
  );
  const copiedInput = await sellerDraft({
    productId: created.productId,
    copyVersionId: original.id,
    content: original.content,
    snapshot: original.snapshot,
  });
  const copied = await createWorkProductDraft(copiedInput);
  const version = copied.workspace.workProducts.find(
    (product) => product.id === created.productId,
  )!.versions[0];
  assert.deepEqual(version.snapshot, original.snapshot);
  assert.deepEqual(version.content, original.content);
  assert.match(version.history[0].actor, /copied retained version/);
  assert.equal(version.status, "pending");
  const currentRevision = copied.workspace.workspace.revision!;
  await assert.rejects(
    createWorkProductDraft({
      ...copiedInput,
      requestId: randomUUID(),
      snapshot: fresh,
      expectedWorkspaceRevision: currentRevision,
    }),
    domainError("STALE_SOURCE"),
  );
  await assert.rejects(
    createWorkProductDraft({
      ...copiedInput,
      requestId: randomUUID(),
      copyVersionId: undefined,
      expectedWorkspaceRevision: currentRevision,
    }),
    domainError("STALE_SOURCE"),
  );
  assert.equal((await getWorkspace()).workspace.revision, currentRevision);
});

test("a PDF prepared before a conflicting edit is rejected and rejection never creates a PDF", async () => {
  const created = await createWorkProductDraft(await sellerDraft());
  const parent = created.workspace.workProducts.find(
    (item) => item.id === created.productId,
  )!;
  const version = parent.versions[0];
  const pdf = await pdfFor(parent, version);
  await assert.rejects(
    reviewWorkProductVersion(parent.id, version.id, {
      decision: "approved",
      expectedEditRevision: 0,
    }),
    domainError("PDF_REQUIRED"),
  );
  await assert.rejects(
    reviewWorkProductVersion(parent.id, version.id, {
      decision: "approved",
      expectedEditRevision: 0,
      ...pdf,
      pdfSha256: "0".repeat(64),
    }),
    domainError("INVALID_PDF"),
  );
  const edited = {
    ...version.content,
    introduction:
      "This edit was saved while a prior document was rendering. The earlier bytes must not become the approved document.",
  };
  await editWorkProductVersion(parent.id, version.id, {
    content: edited,
    expectedEditRevision: 0,
  });
  await assert.rejects(
    reviewWorkProductVersion(parent.id, version.id, {
      decision: "approved",
      expectedEditRevision: 0,
      ...pdf,
    }),
    domainError("EDIT_CONFLICT"),
  );
  const rejected = await reviewWorkProductVersion(parent.id, version.id, {
    decision: "rejected",
    expectedEditRevision: 1,
  });
  const retry = await reviewWorkProductVersion(parent.id, version.id, {
    decision: "rejected",
    expectedEditRevision: 1,
  });
  assert.equal(retry.workspace.revision, rejected.workspace.revision);
  assert.equal(
    rejected.workProducts.find((item) => item.id === parent.id)!.versions[0]
      .hasPdf,
    false,
  );
  await assert.rejects(
    getWorkProductPdf(parent.id, version.id),
    domainError("NOT_FOUND"),
  );
});
test("approved question actions create one scoped unresolved record and resolution is explicit", async () => {
  const created = await createConversationPackage(
    {
      ...conversationInput,
      title: "Sarah’s furniture question",
      transcript: "Sarah asked: Should I move the patio furniture?",
    },
    {
      ...generated(["question"]),
      actions: [
        {
          ...generated(["question"]).actions[0],
          title: "Patio furniture question",
          body: "Should Sarah move the patio furniture?",
          sourceQuote: "Should I move the patio furniture?",
          certainty: "uncertain",
        },
      ],
    },
  );
  const action = created.package.actions[0];
  const decision = {
    decisions: [
      { id: action.id, status: "approved" as const, body: action.body },
    ],
  };
  await Promise.all([
    reviewPackage(created.package.id, decision),
    reviewPackage(created.package.id, decision),
  ]);
  const state = await getWorkspace();
  const questions = state.commitments.filter(
    (item) => item.sourceActionId === action.id,
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0].kind, "question");
  assert.equal(questions[0].status, "open");
  assert.equal(questions[0].clientId, "sarah");
  assert.equal(questions[0].propertyId, "willow");
  assert.equal(questions[0].conversationId, created.conversation.id);
  const resolved = await updateCommitment(questions[0].id, "resolved");
  assert.equal(
    resolved.commitments.find((item) => item.id === questions[0].id)!.status,
    "resolved",
  );
});
test("calendar schedules require complete confirmed instants and remain scoped, durable and idempotent", async () => {
  const state = await getWorkspace();
  const schedule = {
    startsAt: "2026-10-26T15:00:00Z",
    endsAt: "2026-10-26T15:30:00Z",
    timeZone: "America/New_York",
    confirmedAt: new Date().toISOString(),
    confirmedBy: "Workspace reviewer",
  };
  await assert.rejects(
    setTaskCalendar("task-willow-disclosure", {
      ...schedule,
      endsAt: schedule.startsAt,
    }),
  );
  await assert.rejects(
    setTaskCalendar("task-willow-disclosure", {
      ...schedule,
      timeZone: "Unreal/Timezone",
    }),
  );
  await assert.rejects(
    setTaskCalendar("task-willow-disclosure", {
      ...schedule,
      startsAt: "2026-10-26",
    }),
  );
  await assert.rejects(
    setTaskCalendar("task-willow-disclosure", { ...schedule, confirmedBy: "" }),
  );
  await assert.rejects(
    setTaskCalendar("task-willow-disclosure", schedule, undefined, {
      workspaceId: "second-tenant",
    }),
    domainError("NOT_FOUND"),
  );
  const saved = await setTaskCalendar(
    "task-willow-disclosure",
    schedule,
    state.workspace.revision,
  );
  assert.deepEqual(
    saved.tasks.find((item) => item.id === "task-willow-disclosure")!
      .calendarSchedule,
    schedule,
  );
  const retry = await setTaskCalendar(
    "task-willow-disclosure",
    schedule,
    state.workspace.revision,
  );
  assert.equal(retry.workspace.revision, saved.workspace.revision);
  // A real HTTP retry builds fresh confirmation metadata even when its effective
  // schedule and original optimistic revision are unchanged.
  const routeRetry = confirmedTaskSchedule(
    {
      date: "2026-10-26",
      startTime: "11:00",
      endTime: "11:30",
      timeZone: "America/New_York",
      confirmed: true,
      expectedWorkspaceRevision: state.workspace.revision!,
    },
    "2026-10-22T15:00:00Z",
  );
  const retriedFromRoute = await setTaskCalendar(
    "task-willow-disclosure",
    routeRetry,
    state.workspace.revision,
  );
  assert.equal(retriedFromRoute.workspace.revision, saved.workspace.revision);
  assert.deepEqual(
    retriedFromRoute.tasks.find((task) => task.id === "task-willow-disclosure")!
      .calendarSchedule,
    schedule,
  );
  assert.deepEqual(retriedFromRoute.activities, saved.activities);
  await assert.rejects(
    setTaskCalendar(
      "task-willow-disclosure",
      { ...schedule, endsAt: "2026-10-26T16:00:00Z" },
      state.workspace.revision,
    ),
    domainError("WORKSPACE_CHANGED"),
  );
  assert.deepEqual(saved.appointments, state.appointments);
  assert.match(
    saved.activities.find((item) => item.kind === "task_calendar_prepared")!
      .detail,
    /No external calendar event/,
  );
  await closeDatabase();
  assert.deepEqual(
    (await getWorkspace()).tasks.find(
      (item) => item.id === "task-willow-disclosure",
    )!.calendarSchedule,
    schedule,
  );
});
test("sample restore removes prior document artifacts and schedules while preserving other workspaces", async () => {
  const previous = await getWorkspace();
  const approved = previous.workProducts.flatMap((product) =>
    product.versions
      .filter((version) => version.status === "approved")
      .map((version) => ({ product, version })),
  )[0];
  assert.ok(approved);
  const other = await getWorkspace({ workspaceId: "second-tenant" });
  const restored = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  assert.equal(restored.workProducts.length, 1);
  assert.equal(restored.workProducts[0].versions.length, 1);
  assert.equal(restored.workProducts[0].versions[0].status, "pending");
  assert.equal(restored.workProducts[0].versions[0].hasPdf, false);
  assert.equal(
    restored.tasks.some((task) => task.calendarSchedule),
    false,
  );
  await assert.rejects(
    getWorkProductPdf(approved.product.id, approved.version.id),
    domainError("NOT_FOUND"),
  );
  assert.deepEqual(await getWorkspace({ workspaceId: "second-tenant" }), other);
  const { db } = await getDatabase();
  assert.equal((await db.select().from(tables.workProductVersions)).length, 1);
  assert.equal((await db.select().from(tables.workProductAudits)).length, 1);
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

test(
  "production readiness rejects a database missing the work-product migration marker",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const { db } = await getDatabase();
    await db.execute(
      sql`UPDATE agentdesk_migrations SET name = 'test_missing_work_products.sql' WHERE name = '0005_work_products.sql'`,
    );
    try {
      await assert.rejects(probeReadiness(), /not ready/);
    } finally {
      await db.execute(
        sql`UPDATE agentdesk_migrations SET name = '0005_work_products.sql' WHERE name = 'test_missing_work_products.sql'`,
      );
    }
    assert.equal((await probeReadiness()).database, "ok");
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

test("connected situation approval updates facts and one task, preserves questions and PDF, and refreshes only affected content", async () => {
  let state = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  const first = state.packages.find((p) => p.id === "package-sarah")!;
  state = await reviewPackage(first.id, {
    decisions: first.actions
      .filter((a) =>
        [
          "sarah-photographer",
          "sarah-patio-question",
          "sarah-message",
        ].includes(a.id),
      )
      .map((a) => ({ id: a.id, body: a.body, status: "approved" as const })),
  });
  const task = state.tasks.find(
    (t) => t.sourceActionId === "sarah-photographer",
  )!;
  const product = state.workProducts[0],
    version = product.versions[0];
  const pdf = await pdfFor(product, version);
  state = await reviewWorkProductVersion(product.id, version.id, {
    decision: "approved",
    expectedEditRevision: 0,
    ...pdf,
  });
  const before = structuredClone(state);
  const input = {
    ...conversationInput,
    title: "Second seller conversation",
    transcript: situationSampleTranscript,
    requestId: randomUUID(),
  };
  const generatedUpdate = {
    ...generated(["message"]),
    observations: situationSampleObservations,
  };
  const prepared = await createConversationPackage(input, generatedUpdate);
  const retry = await createConversationPackage(input, generatedUpdate);
  assert.equal(retry.package.id, prepared.package.id);
  assert.equal(
    prepared.package.actions.filter((a) => a.kind === "intelligence").length,
    2,
  );
  const taskUpdate = prepared.package.actions.find(
    (a) => a.kind === "task_update",
  )!;
  assert.equal(
    taskUpdate.change?.type === "task" && taskUpdate.change.targetId,
    task.id,
  );
  assert.ok(
    prepared.package.actions.some((a) =>
      proposalImpacts(before, a, prepared.package).some(
        (i) => i.versionId === version.id,
      ),
    ),
  );
  assert.deepEqual(
    (await getWorkspace()).clientFacts,
    before.clientFacts,
    "Extraction alone cannot change reviewed memory.",
  );
  const decisions = prepared.package.actions
    .filter((a) => a.kind !== "message")
    .map((a) => ({ id: a.id, body: a.body, status: "approved" as const }));
  state = await reviewPackage(prepared.package.id, { decisions });
  const retried = await reviewPackage(prepared.package.id, { decisions });
  assert.deepEqual(retried, state);
  assert.equal(
    state.clientFacts!.find(
      (f) => f.topic === "cleaning" && f.status === "current",
    )!.effectiveDate,
    "2026-10-28",
  );
  assert.equal(
    state.clientFacts!.find(
      (f) => f.topic === "photography" && f.status === "current",
    )!.certainty,
    "requested",
  );
  assert.equal(
    state.clientFacts!.filter((f) => f.status === "superseded").length,
    2,
  );
  assert.equal(state.tasks.length, before.tasks.length);
  assert.match(state.tasks.find((t) => t.id === task.id)!.detail, /October 29/);
  assert.deepEqual(state.appointments, before.appointments);
  assert.deepEqual(
    state.commitments,
    before.commitments,
    "The patio question stays open.",
  );
  const impacts = situationImpacts(state);
  assert.ok(
    impacts.some((i) => i.kind === "document" && i.versionId === version.id),
  );
  assert.ok(
    impacts.some((i) => i.kind === "message" && i.targetId === "sarah-message"),
  );
  assert.equal(
    impacts.some((i) => i.targetId === "task-willow-disclosure"),
    false,
  );
  assert.equal(
    (await getWorkProductPdf(product.id, version.id)).pdfSha256,
    pdf.pdfSha256,
  );
  const currentProduct = state.workProducts.find((p) => p.id === product.id)!;
  const refreshed = refreshWorkProduct(
    state,
    currentProduct,
    currentProduct.versions[0],
  );
  assert.match(JSON.stringify(refreshed.content), /October 28/);
  assert.match(JSON.stringify(refreshed.content), /October 29/);
  assert.doesNotMatch(
    JSON.stringify(
      refreshed.content.sections.map((s) => s.items.map((i) => i.text)),
    ),
    /Monday|Tuesday/,
  );
  assert.deepEqual(
    refreshed.content.sections.find((s) => s.kind === "general_guidance"),
    version.content.sections.find((s) => s.kind === "general_guidance"),
  );
  const created = await createWorkProductDraft({
    ...sellerLinks,
    ...refreshed,
    productId: product.id,
    copyVersionId: version.id,
    refreshFromCurrent: true,
    origin: "sample",
    requestId: randomUUID(),
    requestFingerprint: "b".repeat(64),
    expectedWorkspaceRevision: state.workspace.revision!,
  });
  assert.equal(
    created.workspace.workProducts.find((p) => p.id === product.id)!.versions[0]
      .status,
    "pending",
  );
  assert.equal(
    (await getWorkProductPdf(product.id, version.id)).pdfSha256,
    pdf.pdfSha256,
  );
  const latestProduct = created.workspace.workProducts.find(
    (p) => p.id === product.id,
  )!;
  const latestVersion = latestProduct.versions.find(
    (v) => v.id === created.versionId,
  )!;
  const refreshedApproved = await reviewWorkProductVersion(
    product.id,
    latestVersion.id,
    {
      decision: "approved",
      expectedEditRevision: latestVersion.editRevision,
      ...(await pdfFor(latestProduct, latestVersion)),
    },
  );
  assert.equal(
    activeSituationImpacts(refreshedApproved).some(
      (i) => i.kind === "document",
    ),
    false,
    "An approved replacement clears the operational queue.",
  );
  assert.equal(
    situationImpacts(refreshedApproved).some((i) => i.versionId === version.id),
    true,
    "The original still carries its historical warning.",
  );
  const same = await createConversationPackage(
    { ...input, requestId: randomUUID() },
    generatedUpdate,
  );
  assert.equal(
    same.package.actions.some(
      (a) => a.kind === "intelligence" || a.kind === "task_update",
    ),
    false,
  );
  await assert.rejects(
    proposeFactCorrection(
      state.clientFacts![0].id,
      {
        requestId: randomUUID(),
        value: "Correction",
        certainty: "confirmed",
        effectiveDate: null,
        retire: false,
      },
      { workspaceId: "second-tenant" },
    ),
    domainError("NOT_FOUND"),
  );
});

test("human corrections are reviewable, stale concurrent corrections fail, retirement excludes memory and reset restores baseline", async () => {
  let state = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  const fact = state.clientFacts!.find((f) => f.topic === "communication")!;
  const input = {
    requestId: randomUUID(),
    value: "Sarah prefers brief email updates.",
    certainty: "confirmed",
    effectiveDate: null,
    retire: false,
  };
  const packageId = await proposeFactCorrection(fact.id, input);
  assert.equal(await proposeFactCorrection(fact.id, input), packageId);
  const concurrent = await proposeFactCorrection(fact.id, {
    ...input,
    requestId: randomUUID(),
    value: "Sarah prefers phone calls.",
  });
  const pkg = (await getWorkspace()).packages.find((p) => p.id === packageId)!;
  assert.equal(pkg.origin, "human");
  state = await reviewPackage(packageId, {
    decisions: pkg.actions.map((a) => ({
      id: a.id,
      body: a.body,
      status: "approved",
    })),
  });
  const updated = state.clientFacts!.find(
    (f) => f.topic === "communication" && f.status === "current",
  )!;
  assert.equal(updated.value, input.value);
  assert.equal(updated.humanEdited, true);
  assert.equal(
    state.clientFacts!.find((f) => f.id === fact.id)!.value,
    fact.value,
  );
  assert.ok(state.reviewHistory.some((r) => r.packageId === packageId));
  const stale = state.packages.find((p) => p.id === concurrent)!;
  await assert.rejects(
    reviewPackage(concurrent, {
      decisions: stale.actions.map((a) => ({
        id: a.id,
        body: a.body,
        status: "approved",
      })),
    }),
    domainError("STALE_INTELLIGENCE"),
  );
  await reviewPackage(concurrent, {
    decisions: stale.actions.map((a) => ({
      id: a.id,
      body: a.body,
      status: "rejected",
    })),
  });
  const retirement = await proposeFactCorrection(updated.id, {
    ...input,
    requestId: randomUUID(),
    retire: true,
  });
  const retirePkg = (await getWorkspace()).packages.find(
    (p) => p.id === retirement,
  )!;
  state = await reviewPackage(retirement, {
    decisions: retirePkg.actions.map((a) => ({
      id: a.id,
      body: a.body,
      status: "approved",
    })),
  });
  assert.equal(
    state.clientFacts!.some(
      (f) => f.topic === "communication" && f.status === "current",
    ),
    false,
  );
  assert.ok(state.clientFacts!.some((f) => f.status === "retired"));
  const restored = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  assert.equal(restored.clientFacts!.length, 4);
  assert.ok(restored.clientFacts!.every((f) => f.status === "current"));
  assert.equal(restored.reviewHistory.length, 0);
});

test("approving a requested change retains the confirmed arrangement until a human resolves the competing statements", async () => {
  const start = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  const quote =
    "Sarah would prefer cleaning on Thursday, October 29, 2026, instead.";
  const observation = {
    topic: "cleaning" as const,
    value: quote,
    sourceQuote: quote,
    certainty: "requested" as const,
    effectiveDate: "2026-10-29",
    intent: "replacement" as const,
  };
  const prepared = await createConversationPackage(
    { ...conversationInput, transcript: quote, requestId: randomUUID() },
    { ...generated(["summary"]), observations: [observation] },
  );
  const action = prepared.package.actions.find(
    (a) => a.kind === "intelligence",
  )!;
  assert.equal(
    action.change?.type === "fact" && action.change.disposition,
    "request",
  );
  let state = await reviewPackage(prepared.package.id, {
    decisions: [{ id: action.id, body: action.body, status: "approved" }],
  });
  const current = state.clientFacts!.filter(
    (f) => f.topic === "cleaning" && f.status === "current",
  );
  assert.equal(current.length, 2);
  assert.ok(
    current.some(
      (f) => f.certainty === "confirmed" && f.effectiveDate === "2026-10-26",
    ),
  );
  assert.ok(
    current.some(
      (f) => f.certainty === "requested" && f.effectiveDate === "2026-10-29",
    ),
  );
  assert.deepEqual(state.tasks, start.tasks);
  assert.deepEqual(state.appointments, start.appointments);
  const correction = await proposeFactCorrection(current[0].id, {
    requestId: randomUUID(),
    value:
      "The cleaner confirmed Thursday, October 29, 2026; the Monday booking is replaced.",
    certainty: "confirmed",
    effectiveDate: "2026-10-29",
    retire: false,
  });
  const correctionPackage = (await getWorkspace()).packages.find(
    (p) => p.id === correction,
  )!;
  state = await reviewPackage(correction, {
    decisions: correctionPackage.actions.map((a) => ({
      id: a.id,
      body: a.body,
      status: "approved",
    })),
  });
  assert.equal(
    state.clientFacts!.filter(
      (f) => f.topic === "cleaning" && f.status === "current",
    ).length,
    1,
  );
  assert.equal(
    state.clientFacts!.filter(
      (f) => f.topic === "cleaning" && f.status === "superseded",
    ).length,
    2,
  );
  await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
});

test("real review transactions record one scoped workstyle example and sample reset restores the fictional baseline", async () => {
  let workspace = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  const { db } = await getDatabase();
  const scope = {
    kind: "sample" as const,
    workspaceId: SAMPLE_WORKSPACE_ID,
    agentId: "jordan",
  };
  let profile = await getWorkstyle(db, scope);
  assert.equal(profile.evidence.length, 8);
  const pkg = workspace.packages.find((p) => p.id === "package-sarah")!;
  const action = pkg.actions.find((a) => a.kind === "message")!;
  const input = {
    decisions: [
      {
        id: action.id,
        status: "approved" as const,
        body: "Which preparation checklist items would you like to review together?",
      },
    ],
  };
  await Promise.all([
    reviewPackage(pkg.id, input),
    reviewPackage(pkg.id, input),
  ]);
  profile = await getWorkstyle(db, scope);
  assert.equal(
    profile.evidence.filter((e) => e.sourceKey === `message:${action.id}`)
      .length,
    1,
  );
  const product = workspace.workProducts.find(
    (p) => p.id === "product-sarah-preparation",
  )!;
  const version = product.versions[0];
  const content = applyDocumentWorkstyle(
    version.content,
    "seller_preparation",
    resolveWorkstyle({
      sellerPhotoChecklist: {
        value: "include",
        source: "configured",
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  const pdf = await pdfFor(product, version, content);
  const decision = {
    decision: "approved" as const,
    expectedEditRevision: 0,
    content,
    ...pdf,
  };
  await Promise.all([
    reviewWorkProductVersion(product.id, version.id, decision),
    reviewWorkProductVersion(product.id, version.id, decision),
  ]);
  profile = await getWorkstyle(db, scope);
  assert.equal(
    profile.evidence.filter(
      (e) =>
        e.sourceKey === `seller:${product.id}` && e.signals.photoChecklistAdded,
    ).length,
    1,
  );
  profile = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: profile.revision,
    values: { noteFormat: "bullets" },
  });
  const other = {
    kind: "sample" as const,
    workspaceId: SAMPLE_WORKSPACE_ID,
    agentId: "olivia",
  };
  assert.equal((await getWorkstyle(db, other)).evidence.length, 0);
  workspace = await resetSampleWorkspace(SAMPLE_RESET_CONFIRMATION);
  const restored = await getWorkstyle(db, scope);
  assert.deepEqual(restored.preferences, {});
  assert.equal(restored.evidence.length, 8);
  assert.equal(restored.history.length, 0);
  assert.ok(
    restored.evidence.every((e) => e.sourceKey.startsWith("saved-fictional-")),
  );
  assert.equal(workspace.agents.length, 6);
  assert.equal(workspace.workProducts[0].versions[0].status, "pending");
});
