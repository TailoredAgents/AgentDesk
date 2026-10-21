import { eq } from "drizzle-orm";
import type { Database } from "./index";
import * as schema from "./schema";
import {
  SAMPLE_WORKSPACE_ID,
  sampleAgents,
  sampleAppointments,
  sampleClients,
  sampleConversations,
  samplePackages,
  sampleProperties,
  sampleTasks,
  sampleWorkspace,
} from "./seed-data";

/** Non-destructive and repeatable: an existing workspace is never reset by seeding. */
export async function seedDatabase(db: Database): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.workspaces)
      .values(sampleWorkspace)
      .onConflictDoNothing()
      .returning({ id: schema.workspaces.id });
    if (!inserted.length) return false;
    const scoped = <T extends object>(record: T) => ({
      ...record,
      workspaceId: SAMPLE_WORKSPACE_ID,
    });
    await tx.insert(schema.agents).values(sampleAgents.map(scoped));
    await tx.insert(schema.clients).values(sampleClients.map(scoped));
    await tx.insert(schema.properties).values(sampleProperties.map(scoped));
    await tx
      .insert(schema.conversations)
      .values(sampleConversations.map(scoped));
    for (const { actions, ...workPackage } of samplePackages) {
      await tx.insert(schema.workPackages).values(scoped(workPackage));
      await tx
        .insert(schema.proposedActions)
        .values(
          actions.map((action, position) => ({
            ...scoped(action),
            packageId: workPackage.id,
            position,
          })),
        );
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
      );
    await tx.insert(schema.appointments).values(sampleAppointments.map(scoped));
    await tx.insert(schema.activities).values(
      [
        {
          id: "activity-sarah-ready",
          agentId: "jordan",
          clientId: "sarah",
          propertyId: "willow",
          title: "Sarah’s work is ready for your review",
          detail:
            "Saved sample: Conversation, Relationship, and Listing assistants prepared six coordinated actions. Nothing has been sent.",
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
            "Saved sample: Sarah confirmed Monday, October 26. The listing preparation checklist is up to date.",
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
      ].map(scoped),
    );
    // Explicit read guards accidental changes to the fixed sample identifier.
    const [workspace] = await tx
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, SAMPLE_WORKSPACE_ID));
    if (!workspace) throw new Error("Sample workspace creation failed.");
    return true;
  });
}
