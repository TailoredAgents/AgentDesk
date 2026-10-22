import { z } from "zod";
import {
  errorResponse,
  jsonResponse,
  readJson,
  requireSameOrigin,
  rateLimit,
} from "@/lib/auth";
import { contextSchema } from "@/lib/copilot/types";
import { webPrincipal } from "@/lib/copilot/web";
import { conversation, forget } from "@/lib/copilot/store";
import { runCopilot } from "@/lib/copilot/engine";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const agent = z.string().min(1).max(120);
export async function GET(request: Request) {
  try {
    const { principal, cookie } = await webPrincipal(
      request,
      agent.parse(new URL(request.url).searchParams.get("agentId")),
    );
    const state = await conversation(principal);
    const response = jsonResponse({
      conversation: publicState(state),
      available: Boolean(process.env.OPENAI_API_KEY?.trim()),
    });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
// Checkpoints, tool arguments and provider payloads stay server-side.
function publicState(state: Awaited<ReturnType<typeof conversation>>) {
  return {
    ...state,
    turns: state.turns.map(({ calls, ...turn }) => ({
      ...turn,
      operations: calls.length,
    })),
  };
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = await readJson(
      request,
      z
        .object({
          agentId: agent,
          conversationId: z.uuid(),
          requestId: z.uuid(),
          text: z.string().trim().min(1).max(8000),
          context: contextSchema,
        })
        .strict(),
    );
    const { principal } = await webPrincipal(request, input.agentId);
    rateLimit(`copilot:${principal.ownerId}`, 12, 600000);
    await runCopilot(
      principal,
      input.conversationId,
      input.requestId,
      input.text,
      input.context,
    );
    return jsonResponse({
      conversation: publicState(await conversation(principal)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const input = await readJson(
      request,
      z.object({ agentId: agent, conversationId: z.uuid() }).strict(),
    );
    const { principal } = await webPrincipal(request, input.agentId);
    await forget(principal, input.conversationId);
    return jsonResponse({
      conversation: publicState(await conversation(principal)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
