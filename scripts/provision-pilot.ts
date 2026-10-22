import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, closeDatabase } from "../src/lib/db";
import * as s from "../src/lib/crm/schema";
import { externalId } from "../src/lib/crm/security";
config({ quiet: true });
const schema = z
  .object({
    brokerageId: z.string().regex(/^pilot-[a-z0-9-]{3,60}$/),
    brokerageName: z.string().min(1).max(150),
    loftyTeamId: z.string().transform(externalId),
    subject: z.string().regex(/^google:[A-Za-z0-9_-]{5,200}$/),
    label: z.string().min(1).max(150),
    loftyUserId: z.string().transform(externalId),
    role: z.enum(["agent", "leader"]),
    active: z.boolean().default(true),
  })
  .strict();
async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      "Usage: npm run pilot:member -- path-to-private-membership.json (see docs/LOFTY_SETUP.md)",
    );
  const input = schema.parse(JSON.parse(await readFile(file, "utf8")));
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    const [brokerage] = await tx
      .select()
      .from(s.brokerages)
      .where(eq(s.brokerages.id, input.brokerageId))
      .for("update");
    if (brokerage && brokerage.loftyTeamId !== input.loftyTeamId)
      throw new Error(
        "Brokerage Lofty team ID is immutable; provision a different brokerage.",
      );
    if (!brokerage)
      await tx
        .insert(s.brokerages)
        .values({
          id: input.brokerageId,
          name: input.brokerageName,
          loftyTeamId: input.loftyTeamId,
        });
    const [member] = await tx
      .select()
      .from(s.members)
      .where(eq(s.members.subject, input.subject))
      .for("update");
    if (
      member &&
      (member.brokerageId !== input.brokerageId ||
        member.loftyUserId !== input.loftyUserId)
    )
      throw new Error(
        "Identity mappings cannot be reassigned. Deactivate this membership and follow a reviewed migration.",
      );
    if (member)
      await tx
        .update(s.members)
        .set({ label: input.label, role: input.role, active: input.active })
        .where(eq(s.members.id, member.id));
    else
      await tx
        .insert(s.members)
        .values({
          id: randomUUID(),
          brokerageId: input.brokerageId,
          subject: input.subject,
          label: input.label,
          loftyUserId: input.loftyUserId,
          role: input.role,
          active: input.active,
        });
  });
  console.log(
    `Pilot membership ${input.active ? "enabled" : "disabled"}. No CRM data imported; no provider authorization performed.`,
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof z.ZodError
        ? "Invalid membership file. Check the documented fields; all provider IDs must be strings."
        : error instanceof Error
          ? error.message
          : "Pilot provisioning failed.",
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
