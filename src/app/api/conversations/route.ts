import { protectedRoute, readJson } from "@/lib/auth";
import {
  prepareConversation,
  conversationInputSchema,
} from "@/lib/conversation-preparation";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () =>
      prepareConversation(await readJson(request, conversationInputSchema)),
    true,
  );
}
