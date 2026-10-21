import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, probeReadiness, type Database } from "./db";
import * as tables from "./db/schema";
import { SAMPLE_WORKSPACE_ID } from "./db/seed-data";
import { getCapabilities } from "./integrations";
import type {
  Agent,
  Conversation,
  Fact,
  ProposedAction,
  ReviewInput,
  WorkPackage,
  WorkspaceData,
} from "./types";

export { SAMPLE_WORKSPACE_ID } from "./db/seed-data";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_INPUT",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export type WorkspaceScope = { workspaceId: string };
const defaultScope: WorkspaceScope = { workspaceId: SAMPLE_WORKSPACE_ID };
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date",
  );
const reviewSchema = z.object({
  decisions: z
    .array(
      z.object({
        id: text(100),
        status: z.enum(["approved", "rejected"]),
        body: text(12000),
        title: text(200).optional(),
        dueDate: date.nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});
const styleSchema = z.object({
  tone: text(2000),
  length: text(1000),
  avoid: z.string().max(4000),
  examples: z.string().max(8000),
});
const inputSchema = z.object({
  agentId: text(100),
  clientId: text(100),
  propertyId: text(100).nullable(),
  title: text(200),
  transcript: text(50000),
  source: z.enum(["note", "audio"]),
});
const factSchema = z.object({
  text: text(4000),
  certainty: z.enum(["confirmed", "requested", "uncertain"]),
  sourceQuote: text(4000),
});
const generatedSchema = z.object({
  summary: text(12000),
  facts: z.array(factSchema).max(40),
  clarifications: z.array(text(2000)).max(20),
  actions: z
    .array(
      z.object({
        kind: z.enum([
          "summary",
          "crm_note",
          "message",
          "task",
          "listing_update",
        ]),
        title: text(200),
        body: text(12000),
        dueDate: date.nullable(),
        sourceQuote: text(4000),
        certainty: z.enum(["confirmed", "requested", "uncertain"]),
      }),
    )
    .min(1)
    .max(20),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError(result.error.issues[0]?.message || "Invalid input.");
  return result.data;
}
const publicRow = <T extends { workspaceId: string }>(
  row: T,
): Omit<T, "workspaceId"> => {
  const { workspaceId: _, ...record } = row;
  return record;
};
type Connection = Pick<Database, "select" | "insert" | "update">;

async function validateLinks(
  db: Connection,
  scope: WorkspaceScope,
  input: {
    agentId: string;
    clientId: string | null;
    propertyId: string | null;
  },
) {
  const [agent] = await db
    .select()
    .from(tables.agents)
    .where(
      and(
        eq(tables.agents.id, input.agentId),
        eq(tables.agents.workspaceId, scope.workspaceId),
      ),
    );
  if (!agent)
    throw new DomainError(
      "Agent not found in this workspace.",
      404,
      "NOT_FOUND",
    );
  if (input.clientId) {
    const [client] = await db
      .select()
      .from(tables.clients)
      .where(
        and(
          eq(tables.clients.id, input.clientId),
          eq(tables.clients.workspaceId, scope.workspaceId),
        ),
      );
    if (!client || client.agentId !== input.agentId)
      throw new DomainError(
        "The client does not belong to this agent in this workspace.",
        400,
        "INVALID_LINK",
      );
  }
  if (input.propertyId) {
    const [property] = await db
      .select()
      .from(tables.properties)
      .where(
        and(
          eq(tables.properties.id, input.propertyId),
          eq(tables.properties.workspaceId, scope.workspaceId),
        ),
      );
    if (
      !property ||
      property.agentId !== input.agentId ||
      property.clientId !== input.clientId
    )
      throw new DomainError(
        "The property does not belong to this client and agent.",
        400,
        "INVALID_LINK",
      );
  }
}

export async function getWorkspace(
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const { db } = await getDatabase();
  const w = scope.workspaceId;
  const [workspace] = await db
    .select()
    .from(tables.workspaces)
    .where(eq(tables.workspaces.id, w));
  if (!workspace)
    throw new DomainError(
      "Workspace not found. Run the sample seed command to create it.",
      404,
      "NOT_FOUND",
    );
  const [
    agents,
    clients,
    properties,
    tasks,
    conversations,
    packages,
    actions,
    appointments,
    activities,
  ] = await Promise.all([
    db.select().from(tables.agents).where(eq(tables.agents.workspaceId, w)),
    db.select().from(tables.clients).where(eq(tables.clients.workspaceId, w)),
    db
      .select()
      .from(tables.properties)
      .where(eq(tables.properties.workspaceId, w)),
    db
      .select()
      .from(tables.tasks)
      .where(eq(tables.tasks.workspaceId, w))
      .orderBy(asc(tables.tasks.createdAt)),
    db
      .select()
      .from(tables.conversations)
      .where(eq(tables.conversations.workspaceId, w))
      .orderBy(desc(tables.conversations.createdAt)),
    db
      .select()
      .from(tables.workPackages)
      .where(eq(tables.workPackages.workspaceId, w))
      .orderBy(desc(tables.workPackages.createdAt)),
    db
      .select()
      .from(tables.proposedActions)
      .where(eq(tables.proposedActions.workspaceId, w))
      .orderBy(asc(tables.proposedActions.position)),
    db
      .select()
      .from(tables.appointments)
      .where(eq(tables.appointments.workspaceId, w))
      .orderBy(asc(tables.appointments.startsAt)),
    db
      .select()
      .from(tables.activities)
      .where(eq(tables.activities.workspaceId, w))
      .orderBy(desc(tables.activities.createdAt)),
  ]);
  return {
    workspace,
    agents: agents.map(publicRow),
    clients: clients.map(publicRow),
    properties: properties.map(publicRow),
    tasks: tasks.map(({ sourceActionId: _, reviewPackageId: __, ...row }) =>
      publicRow(row),
    ),
    conversations: conversations.map(publicRow),
    packages: packages.map((workPackage) => ({
      ...publicRow(workPackage),
      actions: actions
        .filter((action) => action.packageId === workPackage.id)
        .map(({ packageId: _, position: __, reviewedAt: ___, ...action }) =>
          publicRow(action),
        ),
    })),
    appointments: appointments.map(publicRow),
    activities: activities.map(({ sourceActionId: _, ...row }) =>
      publicRow(row),
    ),
    capabilities: getCapabilities(),
  };
}

/** The package row lock and unique source-action keys make simultaneous approvals exactly once. */
export async function reviewPackage(
  id: string,
  input: ReviewInput,
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const { decisions } = parse(reviewSchema, input);
  if (
    new Set(decisions.map((decision) => decision.id)).size !== decisions.length
  )
    throw new DomainError("Each action may only appear once in a review.");
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    const [workPackage] = await tx
      .select()
      .from(tables.workPackages)
      .where(
        and(
          eq(tables.workPackages.id, id),
          eq(tables.workPackages.workspaceId, scope.workspaceId),
        ),
      )
      .for("update");
    if (!workPackage)
      throw new DomainError("Work package not found.", 404, "NOT_FOUND");
    await validateLinks(tx, scope, workPackage);
    const actions = await tx
      .select()
      .from(tables.proposedActions)
      .where(
        and(
          eq(tables.proposedActions.packageId, id),
          eq(tables.proposedActions.workspaceId, scope.workspaceId),
        ),
      );
    for (const decision of decisions) {
      const action = actions.find((item) => item.id === decision.id);
      if (!action)
        throw new DomainError(
          "An action does not belong to this work package.",
          400,
          "INVALID_LINK",
        );
      if (action.kind === "listing_update" && !workPackage.propertyId)
        throw new DomainError(
          "This listing update has no associated property.",
          400,
          "INVALID_LINK",
        );
      if (
        action.status !== "pending" &&
        (action.status !== decision.status ||
          action.body !== decision.body ||
          (decision.title !== undefined && action.title !== decision.title) ||
          (decision.dueDate !== undefined &&
            action.dueDate !== decision.dueDate))
      ) {
        throw new DomainError(
          "This action has already been reviewed. Refresh to see the saved decision.",
          409,
          "ALREADY_REVIEWED",
        );
      }
    }
    for (const decision of decisions) {
      const action = actions.find((item) => item.id === decision.id)!;
      if (action.status !== "pending") continue;
      const now = new Date().toISOString();
      const edited = {
        ...action,
        ...decision,
        title: decision.title ?? action.title,
        dueDate:
          decision.dueDate === undefined ? action.dueDate : decision.dueDate,
      };
      await tx
        .update(tables.proposedActions)
        .set({
          status: edited.status,
          title: edited.title,
          body: edited.body,
          dueDate: edited.dueDate,
          reviewedAt: now,
        })
        .where(
          and(
            eq(tables.proposedActions.id, action.id),
            eq(tables.proposedActions.workspaceId, scope.workspaceId),
            eq(tables.proposedActions.status, "pending"),
          ),
        );
      const linkage = {
        workspaceId: scope.workspaceId,
        agentId: workPackage.agentId,
        clientId: workPackage.clientId,
        propertyId: workPackage.propertyId,
        sourceActionId: action.id,
      };
      let detail = edited.body;
      if (decision.status === "approved") {
        if (action.kind === "summary")
          await tx
            .update(tables.workPackages)
            .set({ summary: edited.body })
            .where(
              and(
                eq(tables.workPackages.id, id),
                eq(tables.workPackages.workspaceId, scope.workspaceId),
              ),
            );
        if (action.kind === "crm_note")
          await tx
            .update(tables.clients)
            .set({
              notes: sql`${tables.clients.notes} || ${JSON.stringify([edited.body])}::jsonb`,
            })
            .where(
              and(
                eq(tables.clients.id, workPackage.clientId),
                eq(tables.clients.workspaceId, scope.workspaceId),
              ),
            );
        if (action.kind === "listing_update")
          await tx
            .update(tables.properties)
            .set({
              notes: sql`${tables.properties.notes} || ${JSON.stringify([edited.body])}::jsonb`,
            })
            .where(
              and(
                eq(tables.properties.id, workPackage.propertyId!),
                eq(tables.properties.workspaceId, scope.workspaceId),
              ),
            );
        if (action.kind === "task")
          await tx
            .insert(tables.tasks)
            .values({
              id: randomUUID(),
              ...linkage,
              title: edited.title,
              detail: edited.body,
              dueDate: edited.dueDate,
              status: "open",
              priority: "normal",
              source:
                workPackage.origin === "sample"
                  ? "Approved sample proposal"
                  : "Approved AI proposal",
              createdAt: now,
            });
        if (action.kind === "message") {
          await tx
            .insert(tables.approvedMessages)
            .values({
              id: randomUUID(),
              ...linkage,
              subject: edited.title,
              body: edited.body,
              status: "approved",
              createdAt: now,
            });
          detail = `Approved draft saved inside AgentDesk. Not sent; delivery is not connected.\n\n${edited.body}`;
        }
      }
      await tx
        .insert(tables.activities)
        .values({
          id: randomUUID(),
          ...linkage,
          title: `${decision.status === "approved" ? "Approved" : "Rejected"}: ${edited.title}`,
          detail,
          kind:
            decision.status === "rejected"
              ? "action_rejected"
              : action.kind === "message"
                ? "message_approved"
                : `${action.kind}_approved`,
          createdAt: now,
        });
      action.status = decision.status;
    }
    const complete = actions.every((action) => action.status !== "pending");
    await tx
      .update(tables.workPackages)
      .set({ status: complete ? "reviewed" : "pending" })
      .where(
        and(
          eq(tables.workPackages.id, id),
          eq(tables.workPackages.workspaceId, scope.workspaceId),
        ),
      );
    if (complete)
      await tx
        .update(tables.tasks)
        .set({ status: "done" })
        .where(
          and(
            eq(tables.tasks.reviewPackageId, id),
            eq(tables.tasks.workspaceId, scope.workspaceId),
          ),
        );
  });
  return getWorkspace(scope);
}

export async function updateTask(
  id: string,
  status: "open" | "done",
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  if (status !== "open" && status !== "done")
    throw new DomainError("Invalid task status.");
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tables.tasks)
      .where(
        and(
          eq(tables.tasks.id, id),
          eq(tables.tasks.workspaceId, scope.workspaceId),
        ),
      )
      .for("update");
    if (!task) throw new DomainError("Task not found.", 404, "NOT_FOUND");
    await validateLinks(tx, scope, task);
    if (task.status === status) return;
    await tx
      .update(tables.tasks)
      .set({ status })
      .where(
        and(
          eq(tables.tasks.id, id),
          eq(tables.tasks.workspaceId, scope.workspaceId),
        ),
      );
    await tx
      .insert(tables.activities)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        agentId: task.agentId,
        clientId: task.clientId,
        propertyId: task.propertyId,
        title: `${status === "done" ? "Completed" : "Reopened"}: ${task.title}`,
        detail: "Updated by an agent inside AgentDesk.",
        kind: status === "done" ? "task_completed" : "task_reopened",
        createdAt: new Date().toISOString(),
      });
  });
  return getWorkspace(scope);
}

export async function updateAgentStyle(
  id: string,
  style: Agent["style"],
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const clean = parse(styleSchema, style);
  const { db } = await getDatabase();
  const changed = await db
    .update(tables.agents)
    .set({ style: clean })
    .where(
      and(
        eq(tables.agents.id, id),
        eq(tables.agents.workspaceId, scope.workspaceId),
      ),
    )
    .returning({ id: tables.agents.id });
  if (!changed.length)
    throw new DomainError("Agent not found.", 404, "NOT_FOUND");
  return getWorkspace(scope);
}

export type ConversationInput = {
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  transcript: string;
  source: "note" | "audio";
};
export type GeneratedPackage = {
  summary: string;
  facts: Fact[];
  clarifications: string[];
  actions: Omit<ProposedAction, "id" | "status">[];
};
export async function createConversationPackage(
  input: ConversationInput,
  generated: GeneratedPackage,
  scope: WorkspaceScope = defaultScope,
): Promise<{ conversation: Conversation; package: WorkPackage }> {
  const clean = parse(inputSchema, input);
  const prepared = parse(generatedSchema, generated);
  if (
    !clean.propertyId &&
    prepared.actions.some((action) => action.kind === "listing_update")
  )
    throw new DomainError("Listing updates require an associated property.");
  const now = new Date().toISOString();
  const conversation: Conversation = {
    ...clean,
    id: randomUUID(),
    createdAt: now,
  };
  const workPackage: WorkPackage = {
    id: randomUUID(),
    conversationId: conversation.id,
    agentId: clean.agentId,
    clientId: clean.clientId,
    propertyId: clean.propertyId,
    title: clean.title,
    ...prepared,
    actions: prepared.actions.map((action) => ({
      ...action,
      id: randomUUID(),
      status: "pending",
    })),
    origin: "openai",
    status: "pending",
    createdAt: now,
  };
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await validateLinks(tx, scope, clean);
    await tx
      .insert(tables.conversations)
      .values({ ...conversation, workspaceId: scope.workspaceId });
    const { actions, ...row } = workPackage;
    await tx
      .insert(tables.workPackages)
      .values({ ...row, workspaceId: scope.workspaceId });
    await tx
      .insert(tables.proposedActions)
      .values(
        actions.map((action, position) => ({
          ...action,
          position,
          packageId: workPackage.id,
          workspaceId: scope.workspaceId,
        })),
      );
    await tx
      .insert(tables.activities)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        agentId: clean.agentId,
        clientId: clean.clientId,
        propertyId: clean.propertyId,
        title: `Ready for review: ${clean.title}`,
        detail: `${actions.length} actions prepared by OpenAI from an authorized conversation. No actions have been applied or messages sent.`,
        kind: "package_prepared",
        createdAt: now,
      });
  });
  return { conversation, package: workPackage };
}

export async function getHealth(): Promise<{
  database: "ok";
  storage: "postgresql" | "pglite";
}> {
  return probeReadiness();
}
