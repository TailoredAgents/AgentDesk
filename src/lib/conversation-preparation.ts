import { z } from "zod";
import { ApiError, limitAI } from "@/lib/auth";
import { generateWorkPackage } from "@/lib/ai";
import { buildAIContext } from "@/lib/ai-context";
import { coalesceAIRequest } from "@/lib/ai-requests";
import {
  createConversationPackage,
  findConversationPackageByRequestId,
  getWorkspace,
} from "@/lib/repository";

export const conversationInputSchema = z
  .object({
    agentId: z.string().min(1).max(120),
    clientId: z.string().min(1).max(120),
    propertyId: z.string().min(1).max(120).nullable(),
    title: z.string().trim().min(3).max(160),
    transcript: z.string().trim().min(30).max(40000),
    authorized: z.literal(true),
    requestId: z.uuid(),
    source: z.enum(["note", "audio"]).default("note"),
  })
  .strict();

export async function prepareConversation(
  input: z.infer<typeof conversationInputSchema>,
) {
  const workspace = await getWorkspace();
  return coalesceAIRequest(
    `${workspace.workspace.id}:${input.requestId}`,
    input,
    async () => {
      const existing = await findConversationPackageByRequestId(
        input.requestId,
      );
      if (existing) {
        if (
          [
            "agentId",
            "clientId",
            "propertyId",
            "title",
            "transcript",
            "source",
          ].some(
            (key) =>
              existing.conversation[
                key as keyof typeof existing.conversation
              ] !== input[key as keyof typeof input],
          )
        ) {
          throw new ApiError(
            409,
            "This submission identifier belongs to different content. Start a new submission.",
            "request_conflict",
          );
        }
        return {
          packageId: existing.package.id,
          workspace: await getWorkspace(),
        };
      }
      const context = buildAIContext(
        workspace,
        input.agentId,
        input.clientId,
        input.propertyId,
        input.transcript,
      );
      limitAI();
      const generated = await generateWorkPackage(context);
      const result = await createConversationPackage(
        {
          ...input,
          expectedWorkspaceRevision: workspace.workspace.revision ?? 0,
        },
        generated,
      );
      return {
        packageId: result.package.id,
        workspace: await getWorkspace(),
      };
    },
  );
}
