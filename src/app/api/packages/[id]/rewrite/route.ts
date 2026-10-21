import { z } from "zod";
import { ApiError, limitAI, protectedRoute, readJson } from "@/lib/auth";
import { rewriteMessage } from "@/lib/ai";
import { buildAIContext } from "@/lib/ai-context";
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
      const conversation = workspace.conversations.find(
        (item) => item.id === workPackage.conversationId,
      );
      if (!conversation)
        throw new ApiError(
          404,
          "The source conversation is unavailable.",
          "not_found",
        );
      return rewriteMessage(
        buildAIContext(
          workspace,
          workPackage.agentId,
          workPackage.clientId,
          workPackage.propertyId,
          conversation.transcript,
        ),
        workPackage,
        input.text ?? action.body,
        input.instruction,
      );
    },
    true,
  );
}
