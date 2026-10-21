import { z } from "zod";
import { ApiError, limitAI, protectedRoute, readJson } from "@/lib/auth";
import { rewriteMessage } from "@/lib/ai";
import { getWorkspace } from "@/lib/repository";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return protectedRoute(
    request,
    async () => {
      const { id } = await context.params;
      const input = await readJson(
        request,
        z
          .object({
            actionId: z.string().min(1).max(120),
            instruction: z.enum(["shorter", "natural", "professional"]),
            text: z.string().trim().min(1).max(6000).optional(),
          })
          .strict(),
      );
      limitAI();
      const workspace = await getWorkspace();
      const workPackage = workspace.packages.find((item) => item.id === id);
      const action = workPackage?.actions.find(
        (item) => item.id === input.actionId && item.kind === "message",
      );
      if (!workPackage || !action)
        throw new ApiError(
          404,
          "This message draft was not found.",
          "not_found",
        );
      if (action.status !== "pending")
        throw new ApiError(
          409,
          "This draft has already been reviewed.",
          "already_reviewed",
        );
      const agent = workspace.agents.find(
        (item) => item.id === workPackage.agentId,
      );
      const client = workspace.clients.find(
        (item) => item.id === workPackage.clientId,
      );
      const conversation = workspace.conversations.find(
        (item) => item.id === workPackage.conversationId,
      );
      if (!agent || !client || !conversation)
        throw new ApiError(
          404,
          "The source conversation is unavailable.",
          "not_found",
        );
      const property =
        workspace.properties.find(
          (item) => item.id === workPackage.propertyId,
        ) ?? null;
      return rewriteMessage(
        {
          agent,
          client,
          property,
          transcript: conversation.transcript,
          approvedMessages: [],
        },
        workPackage,
        input.text ?? action.body,
        input.instruction,
      );
    },
    true,
  );
}
