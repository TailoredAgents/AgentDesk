import { z } from "zod";
import { ApiError, limitAI, protectedRoute, readJson } from "@/lib/auth";
import { generateWorkPackage } from "@/lib/ai";
import { createConversationPackage, getWorkspace } from "@/lib/repository";

export const runtime = "nodejs";
export const maxDuration = 120;
const inputSchema = z
  .object({
    agentId: z.string().min(1).max(120),
    clientId: z.string().min(1).max(120),
    propertyId: z.string().min(1).max(120).nullable(),
    title: z.string().trim().min(3).max(160),
    transcript: z.string().trim().min(30).max(40000),
    authorized: z.literal(true),
    source: z.enum(["note", "audio"]).default("note"),
  })
  .strict();

export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () => {
      const input = await readJson(request, inputSchema);
      limitAI();
      const workspace = await getWorkspace();
      const agent = workspace.agents.find((item) => item.id === input.agentId);
      const client = workspace.clients.find(
        (item) => item.id === input.clientId && item.agentId === input.agentId,
      );
      const property = input.propertyId
        ? workspace.properties.find(
            (item) =>
              item.id === input.propertyId &&
              item.agentId === input.agentId &&
              item.clientId === input.clientId,
          )
        : null;
      if (!agent || !client || (input.propertyId && !property))
        throw new ApiError(
          400,
          "Choose a client and property assigned to this agent.",
          "invalid_relationship",
        );
      const approvedMessages = workspace.packages
        .filter(
          (item) => item.agentId === agent.id && item.clientId === client.id,
        )
        .flatMap((item) =>
          item.actions
            .filter(
              (action) =>
                action.kind === "message" && action.status === "approved",
            )
            .map((action) => action.body),
        );
      const generated = await generateWorkPackage({
        agent,
        client,
        property: property ?? null,
        transcript: input.transcript,
        approvedMessages,
      });
      const result = await createConversationPackage(input, generated);
      return { packageId: result.package.id, workspace: await getWorkspace() };
    },
    true,
  );
}
