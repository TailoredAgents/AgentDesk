import { protectedRoute, ApiError } from "@/lib/auth";
import {
  createConversationPackage,
  getWorkspace,
  SAMPLE_WORKSPACE_ID,
} from "@/lib/repository";
import {
  situationSampleObservations,
  situationSampleTranscript,
} from "@/lib/intelligence-sample";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () => {
      const state = await getWorkspace();
      if (!state.workspace.sample || state.workspace.id !== SAMPLE_WORKSPACE_ID)
        throw new ApiError(
          403,
          "This example belongs to the fictional workspace only.",
          "sample_only",
        );
      const quote = situationSampleTranscript;
      const result = await createConversationPackage(
        {
          agentId: "jordan",
          clientId: "sarah",
          propertyId: "willow",
          title: "Sarah’s changed plans · second conversation",
          transcript: quote,
          source: "note",
          requestId: "62046d4e-0501-4ab5-8c97-9ff02bcf157a",
          expectedWorkspaceRevision: state.workspace.revision,
        },
        {
          observations: situationSampleObservations,
          summary:
            "Cleaning has moved to Wednesday. Tuesday photography no longer works; Thursday afternoon is requested, not booked. The patio furniture question remains open.",
          facts: situationSampleObservations.map((o) => ({
            text: o.value,
            certainty: o.certainty,
            sourceQuote: o.sourceQuote,
          })),
          clarifications: [
            "Confirm Thursday with the photographer before recording a booking.",
            "Answer the existing patio furniture question; this conversation does not resolve it.",
          ],
          actions: [
            {
              kind: "message",
              title: "Updated message to Sarah",
              body: "Hey Sarah, I’ve noted cleaning for Wednesday, October 28. I’ll check Thursday afternoon, October 29, with the photographer and confirm once we hear back. I’m also checking your patio furniture question. Thursday photos aren’t booked yet.",
              dueDate: null,
              sourceQuote: quote,
              certainty: "requested",
            },
          ],
        },
        undefined,
        { origin: "sample" },
      );
      return { packageId: result.package.id, workspace: await getWorkspace() };
    },
    true,
  );
}
