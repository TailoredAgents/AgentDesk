import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as schema from "./schema";
import {
  SAMPLE_WORKSPACE_ID,
  sampleAgents,
  sampleAppointments,
  sampleClients,
  sampleCommitments,
  sampleConversations,
  samplePackages,
  sampleProperties,
  sampleTasks,
  sampleWorkspace,
} from "./seed-data";

export const SAMPLE_DATA_VERSION = 4;
type SeedConnection = Pick<Database, "insert" | "update" | "select">;
const scoped = <T extends object>(record: T) => ({
  ...record,
  workspaceId: SAMPLE_WORKSPACE_ID,
});

/** Inserts only missing fictional records. Existing decisions, tasks, notes and history are preserved. */
export async function populateSampleWorkspace(tx: SeedConnection) {
  await tx
    .insert(schema.agents)
    .values(sampleAgents.map(scoped))
    .onConflictDoNothing();
  await tx
    .insert(schema.clients)
    .values(sampleClients.map(scoped))
    .onConflictDoNothing();
  await tx
    .insert(schema.properties)
    .values(sampleProperties.map(scoped))
    .onConflictDoNothing();
  await tx
    .insert(schema.conversations)
    .values(sampleConversations.map(scoped))
    .onConflictDoNothing();
  for (const { actions, ...workPackage } of samplePackages) {
    await tx
      .insert(schema.workPackages)
      .values(scoped(workPackage))
      .onConflictDoNothing();
    await tx
      .insert(schema.proposedActions)
      .values(
        actions.map((action, position) => ({
          ...scoped(action),
          packageId: workPackage.id,
          position,
          original: {
            title: action.title,
            body: action.body,
            dueDate: action.dueDate,
          },
          originalAvailable: true,
        })),
      )
      .onConflictDoNothing();
  }
  await tx
    .insert(schema.tasks)
    .values(
      sampleTasks.map((task) => ({
        ...scoped(task),
        reviewPackageId:
          task.id === "task-sarah-review"
            ? "package-sarah"
            : task.id === "task-cedar-recap"
              ? "package-emily"
              : null,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(schema.appointments)
    .values(sampleAppointments.map(scoped))
    .onConflictDoNothing();
  await tx
    .insert(schema.commitments)
    .values(sampleCommitments.map(scoped))
    .onConflictDoNothing();
  await tx
    .insert(schema.activities)
    .values(
      [
        {
          id: "activity-sarah-ready",
          agentId: "jordan",
          clientId: "sarah",
          propertyId: "willow",
          title: "Sarah’s work is ready for your review",
          detail:
            "Saved sample: six coordinated actions are ready. Photography is still unconfirmed; no message has been sent.",
          kind: "package_prepared",
          createdAt: "2026-10-21T13:45:00.000Z",
        },
        {
          id: "activity-cleaning-confirmed",
          agentId: "jordan",
          clientId: "sarah",
          propertyId: "willow",
          title: "Willow Lane cleaning confirmed",
          detail:
            "Saved sample: Sarah confirmed Monday, October 26. Photography confirmation is still outstanding.",
          kind: "task_completed",
          createdAt: "2026-10-20T16:10:00.000Z",
        },
        {
          id: "activity-oak-photos",
          agentId: "olivia",
          clientId: "robert",
          propertyId: "oak",
          title: "Oak Ridge photos reviewed",
          detail:
            "Saved sample: Robert approved the selected property photography.",
          kind: "task_completed",
          createdAt: "2026-10-20T15:20:00.000Z",
        },
        {
          id: "activity-noah-lender",
          agentId: "sophie",
          clientId: "noah",
          propertyId: null,
          title: "Noah’s lender introduction complete",
          detail: "Saved sample: introduction acknowledged and recorded.",
          kind: "task_completed",
          createdAt: "2026-10-20T14:10:00.000Z",
        },
        {
          id: "activity-michael-prepared",
          agentId: "jordan",
          clientId: "michael",
          propertyId: null,
          title: "Michael’s overdue follow-up has a saved draft",
          detail:
            "Saved sample output based on the open October 22 buyer-tour follow-up. The task remains open until a human records completion; no message has been sent.",
          kind: "package_prepared",
          createdAt: "2026-10-23T13:30:00.000Z",
        },
        {
          id: "activity-emily-question",
          agentId: "marcus",
          clientId: "emily",
          propertyId: "cedar",
          title: "Emily’s open question is ready for review",
          detail:
            "Saved sample draft acknowledges the patio furniture question. Preparation advice is still unresolved.",
          kind: "package_prepared",
          createdAt: "2026-10-23T13:35:00.000Z",
        },
      ].map(scoped),
    )
    .onConflictDoNothing();
}

/** Repeatable and non-destructive. Only versioned fictional fixture additions are applied. */
export async function seedDatabase(db: Database): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.workspaces)
      .values({ ...sampleWorkspace, sampleVersion: SAMPLE_DATA_VERSION })
      .onConflictDoNothing()
      .returning({ id: schema.workspaces.id });
    const [workspace] = await tx
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, SAMPLE_WORKSPACE_ID))
      .for("update");
    if (!workspace?.sample) return false;
    if (!inserted.length && workspace.sampleVersion >= SAMPLE_DATA_VERSION)
      return false;
    await populateSampleWorkspace(tx);
    if (!inserted.length) {
      // Upgrade only presentation metadata and known fictional fixtures; reviewed content is untouched.
      for (const appointment of sampleAppointments)
        await tx
          .update(schema.appointments)
          .set({ startsAt: appointment.startsAt, endsAt: appointment.endsAt })
          .where(
            and(
              eq(schema.appointments.id, appointment.id),
              eq(schema.appointments.workspaceId, SAMPLE_WORKSPACE_ID),
            ),
          );
      for (const pkg of samplePackages.filter((item) => item.recommendationId))
        await tx
          .update(schema.workPackages)
          .set({
            recommendationId: pkg.recommendationId,
            signalIds: pkg.signalIds,
          })
          .where(
            and(
              eq(schema.workPackages.id, pkg.id),
              eq(schema.workPackages.workspaceId, SAMPLE_WORKSPACE_ID),
            ),
          );
      for (const agent of sampleAgents) {
        const { directness, greeting, signoff, preferredWords } = agent.style;
        await tx
          .update(schema.agents)
          .set({
            style: sql`${JSON.stringify({ directness, greeting, signoff, preferredWords })}::jsonb || ${schema.agents.style}`,
          })
          .where(
            and(
              eq(schema.agents.id, agent.id),
              eq(schema.agents.workspaceId, SAMPLE_WORKSPACE_ID),
            ),
          );
        // Early fixtures copied Jordan’s example to every profile. Replace only that
        // exact known default; an agent’s saved custom example must survive upgrades.
        if (agent.id !== "jordan")
          await tx
            .update(schema.agents)
            .set({
              style: sql`${schema.agents.style} || ${JSON.stringify({ examples: agent.style.examples })}::jsonb`,
            })
            .where(
              and(
                eq(schema.agents.id, agent.id),
                eq(schema.agents.workspaceId, SAMPLE_WORKSPACE_ID),
                sql`${schema.agents.style}->>'examples' = ${sampleAgents.find((item) => item.id === "jordan")!.style.examples}`,
              ),
            );
      }
    }
    await tx
      .update(schema.workspaces)
      .set({
        referenceDate: sampleWorkspace.referenceDate,
        sampleVersion: SAMPLE_DATA_VERSION,
        revision: inserted.length ? workspace.revision : workspace.revision + 1,
      })
      .where(
        and(
          eq(schema.workspaces.id, SAMPLE_WORKSPACE_ID),
          eq(schema.workspaces.sample, true),
        ),
      );
    return Boolean(inserted.length);
  });
}
