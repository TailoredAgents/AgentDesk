import { ApiError, limitAI } from "@/lib/auth";
import { buildAIContext } from "@/lib/ai-context";
import { generateFollowUpPackage } from "@/lib/ai";
import {
  createConversationPackage,
  findConversationPackageByRecommendationId,
  getWorkspace,
} from "@/lib/repository";

const running = new Map<string, Promise<string>>();

export async function prepareFollowUp(id: string, agentId: string) {
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
