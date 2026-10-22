import { createHash, randomUUID } from "node:crypto";
import { requireAuth, sessionCookie, ApiError } from "../auth";
import { SAMPLE_WORKSPACE_ID } from "../db/seed-data";
import { enabled, type Principal } from "./types";
import { scopedWorkspace } from "./tools";

export async function webPrincipal(request: Request, agentId: string) {
  if (!enabled())
    throw new ApiError(404, "Copilot preview is disabled.", "copilot_disabled");
  requireAuth(request);
  const existing = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("agentdesk_copilot="))
    ?.slice("agentdesk_copilot=".length);
  const browser =
    existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : randomUUID();
  const p: Principal = {
    kind: "sample",
    workspaceId: SAMPLE_WORKSPACE_ID,
    agentId,
    ownerId: createHash("sha256")
      .update(`${sessionCookie(request) ?? "local-development"}:${browser}`)
      .digest("hex"),
  };
  await scopedWorkspace(p);
  return {
    principal: p,
    cookie: `agentdesk_copilot=${browser}; Path=/api/copilot; HttpOnly; SameSite=Strict; Max-Age=1209600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}
