import { z } from "zod";
import { ApiError, limitAI, protectedRoute, readJson } from "@/lib/auth";
import { buildAIContext } from "@/lib/ai-context";
import { generateFollowUpPackage } from "@/lib/ai";
import {
  createConversationPackage,
  findConversationPackageByRecommendationId,
  getWorkspace,
} from "@/lib/repository";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z
  .object({
    agentId: z.string().min(1).max(120),
    recommendationId: z.string().min(1).max(240).optional(),
  })
  .strict();
const running = new Map<string, Promise<string>>();

async function prepare(id: string, agentId: string) {
  const existing = running.get(id);
  if (existing) return existing;
  const operation = (async () => {
    const prior = await findConversationPackageByRecommendationId(id);
    if (prior) return prior.package.id;
    const data = await getWorkspace();
    const item = data.recommendations.find(
      (value) => value.id === id && value.agentId === agentId,
    );
    if (!item)
      throw new ApiError(
        409,
        "This follow-up changed. Refresh the workspace before preparing it.",
        "stale_recommendation",
      );
    if (!data.capabilities.ai)
      throw new ApiError(
        503,
        "Live AI is not configured. Open a saved sample package in Review.",
        "ai_not_configured",
      );
    limitAI();
    const context = buildAIContext(
      data,
      item.agentId,
      item.clientId,
      item.propertyId,
      item.sourceSnapshot,
    );
    const generated = await generateFollowUpPackage(
      context,
      item.sourceSnapshot,
    );
    const result = await createConversationPackage(
      {
        agentId: item.agentId,
        clientId: item.clientId,
        propertyId: item.propertyId,
        title: item.title,
        transcript: item.sourceSnapshot,
        source: "followup",
        recommendationId: item.id,
        expectedWorkspaceRevision: data.workspace.revision ?? 0,
      },
      generated,
    );
    return result.package.id;
  })();
  running.set(id, operation);
  try {
    return await operation;
  } finally {
    running.delete(id);
  }
}

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
          ids.push(await prepare(item.id, input.agentId));
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
