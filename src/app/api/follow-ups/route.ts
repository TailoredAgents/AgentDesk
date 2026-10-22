import { prepareFollowUp } from "@/lib/follow-up-preparation";
import { z } from "zod";
import { ApiError, protectedRoute, readJson } from "@/lib/auth";
import { getWorkspace } from "@/lib/repository";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z
  .object({
    agentId: z.string().min(1).max(120),
    recommendationId: z.string().min(1).max(240).optional(),
  })
  .strict();
export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () => {
      const input = await readJson(request, schema);
      const data = await getWorkspace();
      if (!data.agents.some((agent) => agent.id === input.agentId))
        throw new ApiError(
          400,
          "Choose an agent in this workspace.",
          "invalid_agent",
        );
      const candidates = data.recommendations.filter(
        (item) =>
          item.agentId === input.agentId &&
          (!input.recommendationId || item.id === input.recommendationId),
      );
      if (input.recommendationId && !candidates.length)
        throw new ApiError(
          409,
          "This follow-up changed. Refresh the workspace.",
          "stale_recommendation",
        );
      const ids: string[] = [];
      if (data.capabilities.ai) {
        for (const item of candidates
          .filter((value) => value.status === "needs_draft")
          .slice(0, 3))
          ids.push(await prepareFollowUp(item.id, input.agentId));
      }
      return {
        workspace: await getWorkspace(),
        prepared: ids.length,
        packageIds: ids,
      };
    },
    true,
  );
}
