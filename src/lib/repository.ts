import { createHash, randomUUID } from "node:crypto";
import { observe, readWorkstyleContext } from "./workstyle/service";
import { messageSignals, documentSignals } from "./workstyle/engine";
import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, sql, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, probeReadiness, type Database } from "./db";
import * as tables from "./db/schema";
import { SAMPLE_WORKSPACE_ID, sampleWorkspace } from "./db/seed-data";
import { populateSampleWorkspace, SAMPLE_DATA_VERSION } from "./db/seed";
import {
  coordinateActions,
  factProperty,
  sameRelationship,
} from "./intelligence";
import {
  observationSchema,
  validateObservations,
} from "./intelligence-validation";
import { topicLabels } from "./intelligence-types";
import { deriveFollowUps } from "./follow-ups";
import { getCapabilities } from "./integrations";
import {
  buildWorkProductSnapshot,
  refreshWorkProduct,
  validateWorkProductContent,
} from "./work-product-content";
import type {
  WorkProductKind,
  WorkProductContent,
  WorkProductSnapshot,
  TaskCalendarSchedule,
} from "./work-product-types";
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
  directness: z.string().max(500).optional(),
  greeting: z.string().max(500).optional(),
  signoff: z.string().max(500).optional(),
  preferredWords: z.string().max(500).optional(),
});
const inputSchema = z.object({
  agentId: text(100),
  clientId: text(100),
  propertyId: text(100).nullable(),
  title: text(200),
  transcript: text(50000),
  source: z.enum(["note", "audio", "followup"]),
  requestId: z.uuid().optional(),
  recommendationId: text(300).optional(),
  expectedWorkspaceRevision: z.number().int().nonnegative().optional(),
});
const factSchema = z.object({
  text: text(4000),
  certainty: z.enum(["confirmed", "requested", "uncertain"]),
  sourceQuote: text(4000),
});
const generatedSchema = z.object({
  observations: z.array(observationSchema).max(12).optional(),
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
          "question",
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
async function serialQueries<const T extends readonly PromiseLike<unknown>[]>(
  queries: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  // A snapshot transaction owns one pg connection. Do not pipeline concurrent queries on it.
  const results: unknown[] = [];
  for (const query of queries) results.push(await query);
  return results as { -readonly [K in keyof T]: Awaited<T[K]> };
}
async function lockWorkspace(db: Connection, scope: WorkspaceScope) {
  const [workspace] = await db
    .select()
    .from(tables.workspaces)
    .where(eq(tables.workspaces.id, scope.workspaceId))
    .for("update");
  if (!workspace)
    throw new DomainError("Workspace not found.", 404, "NOT_FOUND");
  return workspace;
}
async function advanceWorkspaceRevision(db: Connection, scope: WorkspaceScope) {
  // Every successful mutation holds the workspace row lock until this version commits.
  await db
    .update(tables.workspaces)
    .set({
      revision: sql`${tables.workspaces.revision} + 1`,
    })
    .where(eq(tables.workspaces.id, scope.workspaceId));
}

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
  connection?: Connection,
): Promise<WorkspaceData> {
  if (!connection) {
    const { db } = await getDatabase();
    return db.transaction((tx) => getWorkspace(scope, tx), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
  const db = connection;
  const {
    pdfBase64: _pdf,
    requestId: _request,
    requestFingerprint: _fingerprint,
    requestMetadata: _metadata,
    reviewInputRevision: _review,
    ...versionColumns
  } = getTableColumns(tables.workProductVersions);
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
    commitments,
    reviewHistory,
    workProducts,
    productVersions,
    productAudits,
    clientFacts,
  ] = await serialQueries([
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
    db
      .select()
      .from(tables.commitments)
      .where(eq(tables.commitments.workspaceId, w))
      .orderBy(asc(tables.commitments.id)),
    db
      .select()
      .from(tables.reviewAudits)
      .where(eq(tables.reviewAudits.workspaceId, w))
      .orderBy(desc(tables.reviewAudits.reviewedAt)),
    db
      .select()
      .from(tables.workProducts)
      .where(eq(tables.workProducts.workspaceId, w))
      .orderBy(desc(tables.workProducts.createdAt)),
    db
      .select({
        ...versionColumns,
        hasPdf: sql<boolean>`${tables.workProductVersions.pdfBase64} IS NOT NULL`,
      })
      .from(tables.workProductVersions)
      .where(eq(tables.workProductVersions.workspaceId, w))
      .orderBy(desc(tables.workProductVersions.version)),
    db
      .select()
      .from(tables.workProductAudits)
      .where(eq(tables.workProductAudits.workspaceId, w))
      .orderBy(
        asc(tables.workProductAudits.versionId),
        asc(tables.workProductAudits.editRevision),
        // Revision and event order remain authoritative when sample timestamps
        // are in the future or a server's wall clock moves backwards.
        asc(sql`CASE ${tables.workProductAudits.event}
          WHEN 'created' THEN 0 WHEN 'edited' THEN 1 ELSE 2 END`),
        asc(tables.workProductAudits.createdAt),
        asc(tables.workProductAudits.id),
      ),
    db
      .select()
      .from(tables.clientFacts)
      .where(eq(tables.clientFacts.workspaceId, w)),
  ]);
  const result: WorkspaceData = {
    workspace,
    clientFacts: clientFacts.map(publicRow),
    agents: agents.map(publicRow),
    clients: clients.map(publicRow),
    properties: properties.map(publicRow),
    tasks: tasks.map(publicRow),
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
    commitments: commitments.map(publicRow),
    reviewHistory: reviewHistory.map(publicRow),
    workProducts: workProducts.map((product) => ({
      ...publicRow(product),
      versions: productVersions
        .filter((version) => version.productId === product.id)
        .map(({ productId: _, ...version }) => ({
          ...publicRow(version),
          history: productAudits
            .filter((audit) => audit.versionId === version.id)
            .map(({ productId: _, versionId: __, ...audit }) =>
              publicRow(audit),
            ),
        })),
    })),
    recommendations: [],
  };
  for (const agent of result.agents) {
    const workstyle = await readWorkstyleContext(db, {
      kind: "sample",
      workspaceId: w,
      agentId: agent.id,
    });
    if (
      Object.keys(workstyle.values).length ||
      workstyle.requirements.length > 1
    )
      agent.workstyle = workstyle;
  }
  result.recommendations = deriveFollowUps(result);
  return result;
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
    await lockWorkspace(tx, scope);
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
    if (
      !decisions.some(
        (decision) =>
          actions.find((action) => action.id === decision.id)!.status ===
          "pending",
      )
    )
      return;
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
      await tx.insert(tables.reviewAudits).values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        packageId: id,
        actionId: action.id,
        agentId: workPackage.agentId,
        clientId: workPackage.clientId,
        propertyId: workPackage.propertyId,
        decision: decision.status,
        original: action.original,
        edited: {
          title: edited.title,
          body: edited.body,
          dueDate: edited.dueDate,
        },
        reviewedAt: now,
        actor: "Workspace reviewer (shared sample access)",
        originalAvailable: action.originalAvailable,
      });
      let detail = edited.body;
      if (
        scope.workspaceId === SAMPLE_WORKSPACE_ID &&
        action.kind === "message" &&
        action.originalAvailable &&
        decision.status === "approved"
      ) {
        const [conversation] = await tx
          .select()
          .from(tables.conversations)
          .where(
            and(
              eq(tables.conversations.id, workPackage.conversationId),
              eq(tables.conversations.workspaceId, scope.workspaceId),
            ),
          );
        if (workPackage.recommendationId || conversation?.source === "followup")
          await observe(
            tx,
            {
              kind: "sample",
              workspaceId: scope.workspaceId,
              agentId: workPackage.agentId,
            },
            {
              sourceKey: `message:${action.id}`,
              contextKey: workPackage.clientId,
              workflow: "follow_up",
              before: action.original.body,
              after: edited.body,
              signals: messageSignals(action.original.body, edited.body),
            },
          );
      }
      if (decision.status === "approved") {
        if (action.kind === "intelligence") {
          if (edited.body.length > 1000)
            throw new DomainError(
              "Keep a remembered fact to 1000 characters or fewer.",
            );
          const change = action.change;
          if (!change || change.type !== "fact")
            throw new DomainError("The intelligence proposal is incomplete.");
          const propertyId = factProperty(
            change.observation.topic,
            workPackage.propertyId,
          );
          const state = await getWorkspace(scope, tx);
          const current = (state.clientFacts ?? []).filter(
            (f) =>
              sameRelationship(f, { ...workPackage, propertyId }) &&
              f.topic === change.observation.topic &&
              f.status === "current",
          );
          if (
            !isDeepStrictEqual(
              current.map((f) => f.id).sort(),
              change.before.map((f) => f.id).sort(),
            )
          )
            throw new DomainError(
              "This client's situation changed after this proposal was prepared. Reject this stale proposal and prepare a current correction.",
              409,
              "STALE_INTELLIGENCE",
            );
          const replaces =
            change.disposition === "replace" || change.disposition === "retire";
          if (replaces)
            for (const prior of current)
              await tx
                .update(tables.clientFacts)
                .set({
                  status:
                    change.disposition === "retire" ? "retired" : "superseded",
                })
                .where(
                  and(
                    eq(tables.clientFacts.id, prior.id),
                    eq(tables.clientFacts.workspaceId, scope.workspaceId),
                  ),
                );
          await tx.insert(tables.clientFacts).values({
            id: randomUUID(),
            ...linkage,
            propertyId,
            topic: change.observation.topic,
            value: edited.body,
            sourceQuote: action.sourceQuote,
            sourceConversationId: workPackage.conversationId,
            certainty:
              change.disposition === "conflict"
                ? "disputed"
                : change.observation.certainty,
            effectiveDate: edited.dueDate,
            status: change.disposition === "retire" ? "retired" : "current",
            recordedAt: workPackage.createdAt,
            reviewedAt: now,
            reviewer: "Workspace reviewer (shared sample access)",
            supersedes: replaces ? current.map((f) => f.id) : [],
            humanEdited: Boolean(
              change.humanCorrection ||
              edited.body !== action.original.body ||
              edited.dueDate !== action.original.dueDate,
            ),
          });
        }
        if (action.kind === "task_update") {
          const change = action.change;
          if (!change || change.type !== "task")
            throw new DomainError("The task proposal is incomplete.");
          const [target] = await tx
            .select()
            .from(tables.tasks)
            .where(
              and(
                eq(tables.tasks.id, change.targetId),
                eq(tables.tasks.workspaceId, scope.workspaceId),
              ),
            );
          if (
            !target ||
            !sameRelationship(target, workPackage) ||
            !isDeepStrictEqual(
              {
                title: target.title,
                detail: target.detail,
                dueDate: target.dueDate,
                status: target.status,
                calendarSchedule: target.calendarSchedule ?? null,
              },
              change.before,
            )
          )
            throw new DomainError(
              "This task changed after the update was prepared. Refresh and prepare a new correction.",
              409,
              "STALE_TASK",
            );
          await tx
            .update(tables.tasks)
            .set({
              title: edited.title,
              detail: edited.body,
              dueDate: edited.dueDate,
            })
            .where(
              and(
                eq(tables.tasks.id, target.id),
                eq(tables.tasks.workspaceId, scope.workspaceId),
              ),
            );
        }

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
          await tx.insert(tables.tasks).values({
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
        if (action.kind === "question")
          await tx.insert(tables.commitments).values({
            id: randomUUID(),
            ...linkage,
            conversationId: workPackage.conversationId,
            kind: "question",
            title: edited.title,
            detail: edited.body,
            dueDate: edited.dueDate,
            status: "open",
            sourceQuote: action.sourceQuote,
            createdAt: now,
          });
        if (action.kind === "message") {
          await tx.insert(tables.approvedMessages).values({
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
      await tx.insert(tables.activities).values({
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
    await advanceWorkspaceRevision(tx, scope);
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
    await lockWorkspace(tx, scope);
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
    await tx.insert(tables.activities).values({
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
    await advanceWorkspaceRevision(tx, scope);
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
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, scope);
    const [agent] = await tx
      .select()
      .from(tables.agents)
      .where(
        and(
          eq(tables.agents.id, id),
          eq(tables.agents.workspaceId, scope.workspaceId),
        ),
      );
    if (!agent) throw new DomainError("Agent not found.", 404, "NOT_FOUND");
    const keys = Object.keys({ ...agent.style, ...clean }) as Array<
      keyof Agent["style"]
    >;
    if (keys.every((key) => agent.style[key] === clean[key])) return;
    await tx
      .update(tables.agents)
      .set({ style: clean })
      .where(
        and(
          eq(tables.agents.id, id),
          eq(tables.agents.workspaceId, scope.workspaceId),
        ),
      );
    await advanceWorkspaceRevision(tx, scope);
  });
  return getWorkspace(scope);
}

export type ConversationInput = {
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  transcript: string;
  source: "note" | "audio" | "followup";
  requestId?: string;
  recommendationId?: string;
  expectedWorkspaceRevision?: number;
};
export type GeneratedPackage = {
  observations?: import("./intelligence-types").Observation[];
  summary: string;
  facts: Fact[];
  clarifications: string[];
  actions: Omit<ProposedAction, "id" | "status">[];
};
type PackageResult = { conversation: Conversation; package: WorkPackage };
async function findPackageByKey(
  db: Connection,
  key: string,
  field: "requestId" | "recommendationId",
  scope: WorkspaceScope,
): Promise<PackageResult | null> {
  const [pkg] = await db
    .select()
    .from(tables.workPackages)
    .where(
      and(
        eq(tables.workPackages[field], key),
        eq(tables.workPackages.workspaceId, scope.workspaceId),
      ),
    );
  if (!pkg) return null;
  const [conversation] = await db
    .select()
    .from(tables.conversations)
    .where(
      and(
        eq(tables.conversations.id, pkg.conversationId),
        eq(tables.conversations.workspaceId, scope.workspaceId),
      ),
    );
  if (!conversation)
    throw new DomainError(
      "The source conversation is unavailable.",
      409,
      "INVALID_LINK",
    );
  const actions = await db
    .select()
    .from(tables.proposedActions)
    .where(
      and(
        eq(tables.proposedActions.packageId, pkg.id),
        eq(tables.proposedActions.workspaceId, scope.workspaceId),
      ),
    )
    .orderBy(asc(tables.proposedActions.position));
  return {
    conversation: publicRow(conversation),
    package: {
      ...publicRow(pkg),
      actions: actions.map(
        ({ position: _, packageId: __, reviewedAt: ___, ...action }) =>
          publicRow(action),
      ),
    },
  };
}
export async function findConversationPackageByRequestId(
  requestId: string,
  scope: WorkspaceScope = defaultScope,
) {
  const id = parse(z.uuid(), requestId);
  return findPackageByKey((await getDatabase()).db, id, "requestId", scope);
}
export async function findConversationPackageByRecommendationId(
  id: string,
  scope: WorkspaceScope = defaultScope,
) {
  return findPackageByKey(
    (await getDatabase()).db,
    id,
    "recommendationId",
    scope,
  );
}
export async function createConversationPackage(
  input: ConversationInput,
  generated: GeneratedPackage,
  scope: WorkspaceScope = defaultScope,
  options: { origin?: "sample" | "openai" } = {},
): Promise<{ conversation: Conversation; package: WorkPackage }> {
  const clean = parse(inputSchema, input);
  const prepared = parse(generatedSchema, generated);
  if ((clean.source === "followup") !== Boolean(clean.recommendationId))
    throw new DomainError(
      "Proactive work must identify its current recommendation.",
    );
  if (
    !clean.propertyId &&
    prepared.actions.some((action) => action.kind === "listing_update")
  )
    throw new DomainError("Listing updates require an associated property.");
  const now = new Date().toISOString();
  const conversation: Conversation = {
    agentId: clean.agentId,
    clientId: clean.clientId,
    propertyId: clean.propertyId,
    title: clean.title,
    transcript: clean.transcript,
    source: options.origin === "sample" ? "sample" : clean.source,
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
      original: {
        title: action.title,
        body: action.body,
        dueDate: action.dueDate,
      },
      originalAvailable: true,
    })),
    origin: options.origin ?? "openai",
    status: "pending",
    createdAt: now,
    requestId: clean.requestId ?? null,
    recommendationId: clean.recommendationId ?? null,
    signalIds: [],
  };
  const { db } = await getDatabase();
  return db.transaction(async (tx) => {
    const lockedWorkspace = await lockWorkspace(tx, scope);
    await validateLinks(tx, scope, clean);
    if (options.origin === "sample" && !lockedWorkspace.sample)
      throw new DomainError(
        "Saved examples require a fictional workspace.",
        403,
        "SAMPLE_ONLY",
      );
    if (clean.requestId) {
      const existing = await findPackageByKey(
        tx,
        clean.requestId,
        "requestId",
        scope,
      );
      if (existing) {
        const prior = existing.conversation;
        if (
          prior.agentId !== clean.agentId ||
          prior.clientId !== clean.clientId ||
          prior.propertyId !== clean.propertyId ||
          prior.title !== clean.title ||
          prior.transcript !== clean.transcript ||
          prior.source !== conversation.source ||
          (existing.package.recommendationId ?? undefined) !==
            clean.recommendationId
        )
          throw new DomainError(
            "This request ID was already used for a different conversation.",
            409,
            "REQUEST_CONFLICT",
          );
        return existing;
      }
    }
    if (clean.recommendationId) {
      const existing = await findPackageByKey(
        tx,
        clean.recommendationId,
        "recommendationId",
        scope,
      );
      if (existing) {
        if (
          existing.package.agentId !== clean.agentId ||
          existing.package.clientId !== clean.clientId ||
          existing.package.propertyId !== clean.propertyId
        )
          throw new DomainError(
            "Recommendation linkage does not match.",
            409,
            "INVALID_LINK",
          );
        return existing;
      }
    }
    if (
      clean.expectedWorkspaceRevision !== undefined &&
      clean.expectedWorkspaceRevision !== lockedWorkspace.revision
    )
      throw new DomainError(
        "The workspace changed while this work was being prepared. Please refresh and submit it again.",
        409,
        "WORKSPACE_CHANGED",
      );
    if (clean.recommendationId) {
      const state = await getWorkspace(scope, tx);
      const recommendation = state.recommendations.find(
        (item) => item.id === clean.recommendationId,
      );
      if (
        !recommendation ||
        recommendation.agentId !== clean.agentId ||
        recommendation.clientId !== clean.clientId ||
        recommendation.propertyId !== clean.propertyId ||
        recommendation.sourceSnapshot !== clean.transcript
      )
        throw new DomainError(
          "The follow-up context changed. Refresh recommendations before preparing another draft.",
          409,
          "STALE_RECOMMENDATION",
        );
      workPackage.signalIds = [
        ...recommendation.taskIds.map((id) => `task:${id}`),
        ...recommendation.commitmentIds.map((id) => `commitment:${id}`),
      ].sort();
    }
    if (clean.source !== "followup") {
      let observations;
      try {
        observations = validateObservations(
          prepared.observations ?? [],
          clean.transcript,
        );
      } catch (error) {
        throw new DomainError(
          error instanceof Error
            ? error.message
            : "Invalid intelligence evidence.",
        );
      }
      workPackage.actions = coordinateActions(
        await getWorkspace(scope, tx),
        clean,
        workPackage.actions,
        observations,
        randomUUID,
      );
    }
    await tx
      .insert(tables.conversations)
      .values({ ...conversation, workspaceId: scope.workspaceId });
    const { actions, ...row } = workPackage;
    await tx
      .insert(tables.workPackages)
      .values({ ...row, workspaceId: scope.workspaceId });
    await tx.insert(tables.proposedActions).values(
      actions.map((action, position) => ({
        ...action,
        position,
        packageId: workPackage.id,
        workspaceId: scope.workspaceId,
        original: action.original!,
        originalAvailable: true,
      })),
    );
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: clean.agentId,
      clientId: clean.clientId,
      propertyId: clean.propertyId,
      title: `Ready for review: ${clean.title}`,
      detail: `${actions.length} actions prepared from ${options.origin === "sample" ? "a saved fictional example" : "an authorized conversation using OpenAI"}. No actions have been applied or messages sent.`,
      kind: "package_prepared",
      createdAt: now,
    });
    await advanceWorkspaceRevision(tx, scope);
    return { conversation, package: workPackage };
  });
}

export async function updateCommitment(
  id: string,
  status: "open" | "resolved",
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  if (status !== "open" && status !== "resolved")
    throw new DomainError("Invalid commitment status.");
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, scope);
    const [commitment] = await tx
      .select()
      .from(tables.commitments)
      .where(
        and(
          eq(tables.commitments.id, id),
          eq(tables.commitments.workspaceId, scope.workspaceId),
        ),
      )
      .for("update");
    if (!commitment)
      throw new DomainError("Commitment not found.", 404, "NOT_FOUND");
    await validateLinks(tx, scope, commitment);
    if (commitment.status === status) return;
    const now = new Date().toISOString();
    await tx
      .update(tables.commitments)
      .set({ status, resolvedAt: status === "resolved" ? now : null })
      .where(
        and(
          eq(tables.commitments.id, id),
          eq(tables.commitments.workspaceId, scope.workspaceId),
        ),
      );
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: commitment.agentId,
      clientId: commitment.clientId,
      propertyId: commitment.propertyId,
      title: `${status === "resolved" ? "Resolved" : "Reopened"}: ${commitment.title}`,
      detail:
        "A human reviewer explicitly updated this recorded commitment; draft approval never resolves it automatically.",
      kind:
        status === "resolved" ? "commitment_resolved" : "commitment_reopened",
      createdAt: now,
    });
    await advanceWorkspaceRevision(tx, scope);
  });
  return getWorkspace(scope);
}

/** Corrections use the same pending actions, decisions and audit trail as AI proposals. */
export async function proposeFactCorrection(
  factId: string,
  input: unknown,
  scope: WorkspaceScope = defaultScope,
) {
  const clean = parse(
    z.object({
      requestId: z.uuid(),
      value: text(1000),
      certainty: z.enum(["confirmed", "requested", "uncertain"]),
      effectiveDate: date.nullable(),
      retire: z.boolean(),
    }),
    input,
  );
  const { db } = await getDatabase();
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, scope);
    const state = await getWorkspace(scope, tx);
    const fact = state.clientFacts?.find((f) => f.id === factId);
    if (!fact) throw new DomainError("Fact not found.", 404, "NOT_FOUND");
    const transcript = `Human correction: ${topicLabels[fact.topic]}\nRecorded statement: ${clean.value}\nCertainty: ${clean.certainty}\nEffective date: ${clean.effectiveDate ?? "not recorded"}\nRequested review: ${clean.retire ? "Retire this information from future work." : "Replace the current information with this correction."}`;
    const existing = await findPackageByKey(
      tx,
      clean.requestId,
      "requestId",
      scope,
    );
    if (existing) {
      if (
        existing.conversation.transcript !== transcript ||
        !existing.package.actions.some(
          (a) =>
            a.change?.type === "fact" &&
            a.change.before.some((f) => f.id === factId),
        )
      )
        throw new DomainError(
          "This request ID belongs to a different correction.",
          409,
          "REQUEST_CONFLICT",
        );
      return existing.package.id;
    }
    if (fact.status !== "current")
      throw new DomainError(
        "Correct the current fact instead of a historical record.",
        409,
        "STALE_INTELLIGENCE",
      );
    const before = (state.clientFacts ?? []).filter(
      (f) =>
        sameRelationship(f, fact) &&
        f.topic === fact.topic &&
        f.status === "current",
    );
    const now = new Date().toISOString(),
      conversationId = randomUUID(),
      packageId = randomUUID(),
      actionId = randomUUID();
    const title = `${topicLabels[fact.topic]} · ${clean.retire ? "stop using this information" : "human correction"}`;
    const links = {
      workspaceId: scope.workspaceId,
      agentId: fact.agentId,
      clientId: fact.clientId,
      propertyId: fact.propertyId,
    };
    await tx.insert(tables.conversations).values({
      id: conversationId,
      ...links,
      title,
      transcript,
      source: "correction",
      createdAt: now,
    });
    await tx.insert(tables.workPackages).values({
      id: packageId,
      ...links,
      conversationId,
      title,
      summary:
        "A human correction is ready for explicit review. Earlier evidence will remain in history.",
      facts: [],
      clarifications: [],
      status: "pending",
      origin: "human",
      createdAt: now,
      requestId: clean.requestId,
    });
    await tx.insert(tables.proposedActions).values({
      id: actionId,
      workspaceId: scope.workspaceId,
      packageId,
      position: 0,
      kind: "intelligence",
      title,
      body: clean.value,
      dueDate: clean.effectiveDate,
      certainty: clean.certainty,
      sourceQuote: transcript,
      status: "pending",
      original: { title, body: clean.value, dueDate: clean.effectiveDate },
      originalAvailable: true,
      change: {
        type: "fact",
        observation: {
          topic: fact.topic,
          value: clean.value,
          certainty: clean.certainty,
          effectiveDate: clean.effectiveDate,
          sourceQuote: transcript,
          intent: "replacement",
        },
        disposition: clean.retire ? "retire" : "replace",
        before,
        humanCorrection: true,
      },
    });
    await advanceWorkspaceRevision(tx, scope);
    return packageId;
  });
}

export const SAMPLE_RESET_CONFIRMATION = "RESTORE FICTIONAL WORKSPACE";
export async function resetSampleWorkspace(
  confirmation: string,
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  if (confirmation !== SAMPLE_RESET_CONFIRMATION)
    throw new DomainError(
      "Enter the exact fictional-workspace confirmation phrase.",
      400,
      "CONFIRMATION_REQUIRED",
    );
  if (scope.workspaceId !== SAMPLE_WORKSPACE_ID)
    throw new DomainError(
      "Only the dedicated fictional sample workspace can be restored.",
      403,
      "SAMPLE_ONLY",
    );
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, scope);
    if (!workspace.sample)
      throw new DomainError(
        "Real workspaces cannot be restored with the sample reset.",
        403,
        "SAMPLE_ONLY",
      );
    for (const table of [
      tables.clientFacts,
      tables.workProductAudits,
      tables.workProductVersions,
      tables.workProducts,
      tables.reviewAudits,
      tables.approvedMessages,
      tables.activities,
      tables.tasks,
      tables.commitments,
      tables.appointments,
      tables.proposedActions,
      tables.workPackages,
      tables.conversations,
      tables.properties,
      tables.clients,
      tables.agents,
    ]) {
      await tx.delete(table).where(eq(table.workspaceId, scope.workspaceId));
    }
    await populateSampleWorkspace(tx);
    await tx
      .update(tables.workspaces)
      .set({
        name: sampleWorkspace.name,
        referenceDate: sampleWorkspace.referenceDate,
        sampleVersion: SAMPLE_DATA_VERSION,
        revision: workspace.revision + 1,
      })
      .where(eq(tables.workspaces.id, scope.workspaceId));
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: "jordan",
      clientId: null,
      propertyId: null,
      title: "Fictional workspace restored",
      detail:
        "A reviewer explicitly restored the presentation sample. Other workspaces were not changed.",
      kind: "sample_reset",
      createdAt: new Date().toISOString(),
    });
  });
  return getWorkspace(scope);
}

export async function getHealth(): Promise<{
  database: "ok";
  storage: "postgresql" | "pglite";
}> {
  return probeReadiness();
}

const productLinkSchema = z.object({
  kind: z.enum(["seller_preparation", "appointment_briefing"]),
  agentId: text(100),
  clientId: text(100).nullable(),
  propertyId: text(100).nullable(),
  appointmentId: text(100).nullable().optional(),
  sourceConversationId: text(100).nullable().optional(),
  sourcePackageId: text(100).nullable().optional(),
});
const createProductSchema = productLinkSchema.extend({
  productId: text(100).optional(),
  copyVersionId: text(100).optional(),
  refreshFromCurrent: z.boolean().optional(),
  requestId: z.uuid(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.unknown(),
  snapshot: z.unknown(),
  origin: z.enum(["sample", "openai"]),
  expectedWorkspaceRevision: z.number().int().nonnegative(),
});
export type CreateWorkProductInput = {
  kind: WorkProductKind;
  agentId: string;
  clientId: string | null;
  propertyId: string | null;
  appointmentId?: string | null;
  sourceConversationId?: string | null;
  sourcePackageId?: string | null;
  productId?: string;
  copyVersionId?: string;
  refreshFromCurrent?: boolean;
  requestId: string;
  requestFingerprint: string;
  content: WorkProductContent;
  snapshot: WorkProductSnapshot;
  origin: "sample" | "openai";
  expectedWorkspaceRevision: number;
};
const productActor = "Workspace reviewer (shared sample access)";
function assertCurrentRevision(actual: number, expected?: number) {
  if (expected !== undefined && actual !== expected)
    throw new DomainError(
      "The workspace changed while this work was being prepared. Refresh and try again.",
      409,
      "WORKSPACE_CHANGED",
    );
}
function productMetadata(input: z.infer<typeof createProductSchema>) {
  return {
    productId: input.productId ?? null,
    copyVersionId: input.copyVersionId ?? null,
    ...(input.refreshFromCurrent ? { refreshFromCurrent: "true" } : {}),
    kind: input.kind,
    agentId: input.agentId,
    clientId: input.clientId,
    propertyId: input.propertyId,
    appointmentId: input.appointmentId ?? null,
    sourceConversationId: input.sourceConversationId ?? null,
    sourcePackageId: input.sourcePackageId ?? null,
    origin: input.origin,
  };
}
export async function findWorkProductByRequestId(
  requestId: string,
  scope: WorkspaceScope = defaultScope,
) {
  const clean = parse(z.uuid(), requestId);
  const { db } = await getDatabase();
  const [found] = await db
    .select({
      productId: tables.workProductVersions.productId,
      versionId: tables.workProductVersions.id,
      requestFingerprint: tables.workProductVersions.requestFingerprint,
    })
    .from(tables.workProductVersions)
    .where(
      and(
        eq(tables.workProductVersions.workspaceId, scope.workspaceId),
        eq(tables.workProductVersions.requestId, clean),
      ),
    );
  return found ?? null;
}
export async function createWorkProductDraft(
  input: CreateWorkProductInput,
  scope: WorkspaceScope = defaultScope,
) {
  const clean = parse(createProductSchema, input);
  const metadata = productMetadata(clean);
  const { db } = await getDatabase();
  const ids = await db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, scope);
    const [existing] = await tx
      .select({
        id: tables.workProductVersions.id,
        productId: tables.workProductVersions.productId,
        requestFingerprint: tables.workProductVersions.requestFingerprint,
        requestMetadata: tables.workProductVersions.requestMetadata,
      })
      .from(tables.workProductVersions)
      .where(
        and(
          eq(tables.workProductVersions.workspaceId, scope.workspaceId),
          eq(tables.workProductVersions.requestId, clean.requestId),
        ),
      );
    if (existing) {
      if (
        existing.requestFingerprint !== clean.requestFingerprint ||
        !isDeepStrictEqual(existing.requestMetadata, metadata)
      )
        throw new DomainError(
          "This request ID was used for a different work product request.",
          409,
          "REQUEST_CONFLICT",
        );
      return { productId: existing.productId, versionId: existing.id };
    }
    assertCurrentRevision(workspace.revision, clean.expectedWorkspaceRevision);
    await validateLinks(tx, scope, clean);
    if (clean.origin === "sample" && !workspace.sample)
      throw new DomainError(
        "Saved sample output is only available in a fictional workspace.",
        403,
        "SAMPLE_ONLY",
      );
    const state = await getWorkspace(scope, tx);
    const copiedVersion = clean.copyVersionId
      ? state.workProducts
          .find((item) => item.id === clean.productId)
          ?.versions.find((item) => item.id === clean.copyVersionId)
      : undefined;
    const refreshed =
      clean.refreshFromCurrent && copiedVersion
        ? refreshWorkProduct(
            state,
            state.workProducts.find((p) => p.id === clean.productId)!,
            copiedVersion,
          )
        : null;
    if (clean.refreshFromCurrent && !copiedVersion)
      throw new DomainError("Choose an existing version to update.");
    if (
      clean.copyVersionId &&
      (!copiedVersion ||
        copiedVersion.origin !== clean.origin ||
        !isDeepStrictEqual(
          refreshed?.content ?? copiedVersion.content,
          clean.content,
        ))
    )
      throw new DomainError(
        "The copied content must match a retained version of this work product.",
        409,
        "INVALID_COPY",
      );
    // Copying an approved or edited document preserves its historical evidence.
    // Only a fresh AI generation may replace that evidence with current records.
    const snapshot =
      refreshed?.snapshot ??
      copiedVersion?.snapshot ??
      buildWorkProductSnapshot(state, clean);
    if (
      (snapshot.client?.id ?? null) !== clean.clientId ||
      (snapshot.property?.id ?? null) !== clean.propertyId
    )
      throw new DomainError(
        "Use the client and property assigned to the selected source records.",
        400,
        "INVALID_LINK",
      );
    if (!isDeepStrictEqual(snapshot, clean.snapshot))
      throw new DomainError(
        copiedVersion
          ? "A copied document must retain its saved source snapshot."
          : "The document source records changed or do not match this workspace.",
        409,
        "STALE_SOURCE",
      );
    const content = validateWorkProductContent(clean.content, snapshot, {
      humanEdited: Boolean(copiedVersion),
    });
    const now = new Date().toISOString();
    const productId = clean.productId ?? randomUUID();
    const sourceConversationId =
      clean.sourceConversationId ??
      state.packages.find((item) => item.id === clean.sourcePackageId)
        ?.conversationId ??
      null;
    const storedLinks = { ...metadata, sourceConversationId };
    let versionNumber = 1;
    if (clean.productId) {
      const parent = state.workProducts.find(
        (item) => item.id === clean.productId,
      );
      if (!parent)
        throw new DomainError("Work product not found.", 404, "NOT_FOUND");
      for (const key of [
        "kind",
        "agentId",
        "clientId",
        "propertyId",
        "appointmentId",
        "sourceConversationId",
        "sourcePackageId",
      ] as const)
        if (parent[key] !== storedLinks[key])
          throw new DomainError(
            "The new version must retain its work product’s source relationships.",
            400,
            "INVALID_LINK",
          );
      versionNumber =
        Math.max(0, ...parent.versions.map((item) => item.version)) + 1;
    } else
      await tx.insert(tables.workProducts).values({
        id: productId,
        workspaceId: scope.workspaceId,
        kind: clean.kind,
        agentId: clean.agentId,
        clientId: clean.clientId,
        propertyId: clean.propertyId,
        appointmentId: clean.appointmentId ?? null,
        sourceConversationId,
        sourcePackageId: clean.sourcePackageId ?? null,
        createdAt: now,
      });
    const versionId = randomUUID();
    await tx.insert(tables.workProductVersions).values({
      id: versionId,
      productId,
      workspaceId: scope.workspaceId,
      version: versionNumber,
      editRevision: 0,
      status: "pending",
      origin: clean.origin,
      content,
      originalContent: content,
      snapshot,
      requestId: clean.requestId,
      requestFingerprint: clean.requestFingerprint,
      requestMetadata: metadata,
      createdAt: now,
    });
    await tx.insert(tables.workProductAudits).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      productId,
      versionId,
      event: "created",
      editRevision: 0,
      content,
      actor: copiedVersion
        ? `${productActor} (copied retained version)`
        : clean.origin === "sample"
          ? "Saved fictional sample"
          : "AI proposal",
      createdAt: now,
    });
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: clean.agentId,
      clientId: clean.clientId,
      propertyId: clean.propertyId,
      title: `Document ready for review: ${content.title}`,
      detail:
        "A draft work product was saved with its sources. No document has been approved or delivered.",
      kind: "work_product_prepared",
      createdAt: now,
    });
    await advanceWorkspaceRevision(tx, scope);
    if (
      scope.workspaceId === SAMPLE_WORKSPACE_ID &&
      clean.kind === "appointment_briefing" &&
      clean.appointmentId &&
      !clean.copyVersionId
    )
      await observe(
        tx,
        {
          kind: "sample",
          workspaceId: scope.workspaceId,
          agentId: clean.agentId,
        },
        {
          sourceKey: `briefing:${clean.appointmentId}`,
          contextKey: clean.appointmentId,
          workflow: "appointment_briefing",
          before: "Agent requested an appointment briefing.",
          after: `Prepared draft: ${content.title}`,
          signals: { briefingRequested: true },
        },
      );
    return { productId, versionId };
  });
  return { ...ids, workspace: await getWorkspace(scope) };
}
async function lockedProductVersion(
  tx: Connection,
  productId: string,
  versionId: string,
  scope: WorkspaceScope,
) {
  const [parent] = await tx
    .select()
    .from(tables.workProducts)
    .where(
      and(
        eq(tables.workProducts.id, productId),
        eq(tables.workProducts.workspaceId, scope.workspaceId),
      ),
    );
  if (!parent)
    throw new DomainError("Work product not found.", 404, "NOT_FOUND");
  await validateLinks(tx, scope, parent);
  const [version] = await tx
    .select()
    .from(tables.workProductVersions)
    .where(
      and(
        eq(tables.workProductVersions.id, versionId),
        eq(tables.workProductVersions.productId, productId),
        eq(tables.workProductVersions.workspaceId, scope.workspaceId),
      ),
    )
    .for("update");
  if (!version)
    throw new DomainError("Work product version not found.", 404, "NOT_FOUND");
  return { parent, version };
}
export async function editWorkProductVersion(
  productId: string,
  versionId: string,
  input: { content: WorkProductContent; expectedEditRevision: number },
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const clean = parse(
    z.object({
      content: z.unknown(),
      expectedEditRevision: z.number().int().nonnegative(),
    }),
    input,
  );
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, scope);
    const { parent, version } = await lockedProductVersion(
      tx,
      productId,
      versionId,
      scope,
    );
    if (version.status !== "pending")
      throw new DomainError(
        "Reviewed versions cannot be edited. Prepare a new version instead.",
        409,
        "ALREADY_REVIEWED",
      );
    if (clean.expectedEditRevision !== version.editRevision)
      throw new DomainError(
        "This draft has changed. Refresh before editing it.",
        409,
        "EDIT_CONFLICT",
      );
    const content = validateWorkProductContent(
      clean.content,
      version.snapshot,
      { humanEdited: true },
    );
    if (isDeepStrictEqual(content, version.content)) return;
    const editRevision = version.editRevision + 1;
    const now = new Date().toISOString();
    await tx
      .update(tables.workProductVersions)
      .set({ content, editRevision })
      .where(
        and(
          eq(tables.workProductVersions.id, versionId),
          eq(tables.workProductVersions.workspaceId, scope.workspaceId),
        ),
      );
    await tx.insert(tables.workProductAudits).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      productId,
      versionId,
      event: "edited",
      editRevision,
      content,
      actor: productActor,
      createdAt: now,
    });
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: parent.agentId,
      clientId: parent.clientId,
      propertyId: parent.propertyId,
      title: `Edited document draft: ${content.title}`,
      detail: `Version ${version.version} remains pending review.`,
      kind: "work_product_edited",
      createdAt: now,
    });
    await advanceWorkspaceRevision(tx, scope);
  });
  return getWorkspace(scope);
}
export async function reviewWorkProductVersion(
  productId: string,
  versionId: string,
  input: {
    decision: "approved" | "rejected";
    content?: WorkProductContent;
    expectedEditRevision: number;
    pdfBase64?: string;
    pdfSha256?: string;
  },
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const clean = parse(
    z.object({
      decision: z.enum(["approved", "rejected"]),
      content: z.unknown().optional(),
      expectedEditRevision: z.number().int().nonnegative(),
      pdfBase64: z.string().max(16_000_000).optional(),
      pdfSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    }),
    input,
  );
  if (clean.decision === "approved" && (clean.pdfBase64 || clean.pdfSha256)) {
    if (!clean.pdfBase64 || !clean.pdfSha256)
      throw new DomainError(
        "Provide both the prepared PDF and its checksum.",
        400,
        "INVALID_PDF",
      );
    const bytes = Buffer.from(clean.pdfBase64, "base64");
    if (
      bytes.toString("base64") !== clean.pdfBase64 ||
      bytes.subarray(0, 5).toString() !== "%PDF-" ||
      !bytes.subarray(-1024).toString().includes("%%EOF") ||
      createHash("sha256").update(bytes).digest("hex") !== clean.pdfSha256
    )
      throw new DomainError(
        "The prepared PDF is invalid or its checksum does not match.",
        400,
        "INVALID_PDF",
      );
  } else if (
    clean.decision === "rejected" &&
    (clean.pdfBase64 || clean.pdfSha256)
  )
    throw new DomainError("Rejected drafts cannot have a finalized PDF.");
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, scope);
    const { parent, version } = await lockedProductVersion(
      tx,
      productId,
      versionId,
      scope,
    );
    const content =
      clean.content === undefined
        ? version.content
        : validateWorkProductContent(clean.content, version.snapshot, {
            humanEdited: true,
          });
    if (version.status !== "pending") {
      if (
        version.status === clean.decision &&
        isDeepStrictEqual(version.content, content) &&
        (clean.pdfSha256 === undefined ||
          version.pdfSha256 === clean.pdfSha256) &&
        (clean.pdfBase64 === undefined ||
          version.pdfBase64 === clean.pdfBase64) &&
        clean.expectedEditRevision === version.reviewInputRevision
      )
        return;
      throw new DomainError(
        "This version has already been reviewed. Refresh to see the saved decision.",
        409,
        "ALREADY_REVIEWED",
      );
    }
    if (version.editRevision !== clean.expectedEditRevision)
      throw new DomainError(
        "This draft changed while its PDF was being prepared. Refresh and review the latest version.",
        409,
        "EDIT_CONFLICT",
      );
    if (clean.decision === "approved" && (!clean.pdfBase64 || !clean.pdfSha256))
      throw new DomainError(
        "Approval requires the finished PDF.",
        400,
        "PDF_REQUIRED",
      );
    const now = new Date().toISOString();
    if (
      scope.workspaceId === SAMPLE_WORKSPACE_ID &&
      parent.kind === "seller_preparation" &&
      clean.decision === "approved"
    )
      await observe(
        tx,
        {
          kind: "sample",
          workspaceId: scope.workspaceId,
          agentId: parent.agentId,
        },
        {
          sourceKey: `seller:${productId}`,
          contextKey: parent.propertyId || parent.clientId || productId,
          workflow: "seller_preparation",
          before: version.originalContent.sections
            .filter((s) => s.kind === "general_guidance")
            .flatMap((s) => s.items.map((i) => i.text))
            .join("\n"),
          after: content.sections
            .filter((s) => s.kind === "general_guidance")
            .flatMap((s) => s.items.map((i) => i.text))
            .join("\n"),
          signals: documentSignals(version.originalContent, content),
        },
      );
    const contentChanged = !isDeepStrictEqual(content, version.content);
    const editRevision = version.editRevision + Number(contentChanged);
    const reviewedAt = contentChanged
      ? new Date(Date.parse(now) + 1).toISOString()
      : now;
    if (contentChanged)
      await tx.insert(tables.workProductAudits).values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        productId,
        versionId,
        event: "edited",
        editRevision,
        content,
        actor: productActor,
        createdAt: now,
      });
    await tx
      .update(tables.workProductVersions)
      .set({
        content,
        editRevision,
        reviewInputRevision: clean.expectedEditRevision,
        status: clean.decision,
        reviewedAt,
        reviewer: productActor,
        pdfBase64: clean.pdfBase64 ?? null,
        pdfSha256: clean.pdfSha256 ?? null,
      })
      .where(
        and(
          eq(tables.workProductVersions.id, versionId),
          eq(tables.workProductVersions.workspaceId, scope.workspaceId),
        ),
      );
    await tx.insert(tables.workProductAudits).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      productId,
      versionId,
      event: clean.decision,
      editRevision,
      content,
      actor: productActor,
      createdAt: reviewedAt,
    });
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: parent.agentId,
      clientId: parent.clientId,
      propertyId: parent.propertyId,
      title: `${clean.decision === "approved" ? "Finalized PDF" : "Rejected document"}: ${content.title}`,
      detail:
        clean.decision === "approved"
          ? `Version ${version.version} is approved and its PDF is saved in AgentDesk. Downloading or approving does not deliver it to the client.`
          : `Version ${version.version} was rejected. No final PDF was created.`,
      kind:
        clean.decision === "approved"
          ? "work_product_approved"
          : "work_product_rejected",
      createdAt: now,
    });
    await advanceWorkspaceRevision(tx, scope);
  });
  return getWorkspace(scope);
}
export async function getWorkProductPdf(
  productId: string,
  versionId: string,
  scope: WorkspaceScope = defaultScope,
) {
  const { db } = await getDatabase();
  const [row] = await db
    .select({
      version: tables.workProductVersions.version,
      createdAt: tables.workProductVersions.createdAt,
      status: tables.workProductVersions.status,
      pdfBase64: tables.workProductVersions.pdfBase64,
      pdfSha256: tables.workProductVersions.pdfSha256,
      kind: tables.workProducts.kind,
    })
    .from(tables.workProductVersions)
    .innerJoin(
      tables.workProducts,
      and(
        eq(tables.workProducts.id, tables.workProductVersions.productId),
        eq(
          tables.workProducts.workspaceId,
          tables.workProductVersions.workspaceId,
        ),
      ),
    )
    .where(
      and(
        eq(tables.workProductVersions.workspaceId, scope.workspaceId),
        eq(tables.workProductVersions.productId, productId),
        eq(tables.workProductVersions.id, versionId),
      ),
    );
  if (!row || row.status !== "approved" || !row.pdfBase64 || !row.pdfSha256)
    throw new DomainError(
      "An approved PDF is not available for this version.",
      404,
      "NOT_FOUND",
    );
  if (
    createHash("sha256")
      .update(Buffer.from(row.pdfBase64, "base64"))
      .digest("hex") !== row.pdfSha256
  )
    throw new DomainError(
      "The stored document failed its integrity check.",
      500,
      "PDF_INTEGRITY",
    );
  return {
    pdfBase64: row.pdfBase64,
    pdfSha256: row.pdfSha256,
    filename: `${row.kind.replaceAll("_", "-")}-v${row.version}.pdf`,
    version: row.version,
    createdAt: row.createdAt,
  };
}
export async function setTaskCalendar(
  taskId: string,
  schedule: TaskCalendarSchedule | null,
  expectedWorkspaceRevision?: number,
  scope: WorkspaceScope = defaultScope,
): Promise<WorkspaceData> {
  const instant = z.iso.datetime({ offset: true });
  const clean = parse(
    z
      .object({
        startsAt: instant,
        endsAt: instant,
        timeZone: text(100),
        confirmedAt: instant,
        confirmedBy: text(200),
      })
      .nullable(),
    schedule,
  );
  if (expectedWorkspaceRevision !== undefined)
    parse(z.number().int().nonnegative(), expectedWorkspaceRevision);
  if (clean) {
    if (Date.parse(clean.endsAt) <= Date.parse(clean.startsAt))
      throw new DomainError("The calendar end must follow the start.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: clean.timeZone }).format();
    } catch {
      throw new DomainError("Choose a valid calendar time zone.");
    }
  }
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, scope);
    const [task] = await tx
      .select()
      .from(tables.tasks)
      .where(
        and(
          eq(tables.tasks.id, taskId),
          eq(tables.tasks.workspaceId, scope.workspaceId),
        ),
      )
      .for("update");
    if (!task) throw new DomainError("Task not found.", 404, "NOT_FOUND");
    await validateLinks(tx, scope, task);
    if (isDeepStrictEqual(task.calendarSchedule, clean)) return;
    // The route stamps confirmation time on each attempt. Identical effective
    // schedules are retries, not new confirmations or new audit events.
    if (
      task.calendarSchedule &&
      clean &&
      Date.parse(task.calendarSchedule.startsAt) ===
        Date.parse(clean.startsAt) &&
      Date.parse(task.calendarSchedule.endsAt) === Date.parse(clean.endsAt) &&
      task.calendarSchedule.timeZone === clean.timeZone
    )
      return;
    assertCurrentRevision(workspace.revision, expectedWorkspaceRevision);
    await tx
      .update(tables.tasks)
      .set({ calendarSchedule: clean })
      .where(
        and(
          eq(tables.tasks.id, taskId),
          eq(tables.tasks.workspaceId, scope.workspaceId),
        ),
      );
    await tx.insert(tables.activities).values({
      id: randomUUID(),
      workspaceId: scope.workspaceId,
      agentId: task.agentId,
      clientId: task.clientId,
      propertyId: task.propertyId,
      title: `${clean ? "Prepared calendar details" : "Cleared calendar details"}: ${task.title}`,
      detail: clean
        ? `A human confirmed ${clean.startsAt} to ${clean.endsAt} (${clean.timeZone}). No external calendar event has been created.`
        : "The saved calendar schedule was removed. No external calendar was changed.",
      kind: "task_calendar_prepared",
      createdAt: new Date().toISOString(),
    });
    await advanceWorkspaceRevision(tx, scope);
  });
  return getWorkspace(scope);
}
