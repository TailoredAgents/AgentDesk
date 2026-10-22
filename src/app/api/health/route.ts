import { authConfiguration, jsonResponse } from "@/lib/auth";
import {
  validateDeploymentEnvironment,
  validateWorkspaceAccessEnvironment,
} from "@/lib/deployment-config";
import { getHealth } from "@/lib/repository";
import { enabled } from "@/lib/copilot/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const issues =
    process.env.NODE_ENV === "production"
      ? validateDeploymentEnvironment(process.env)
      : authConfiguration().ready
        ? []
        : validateWorkspaceAccessEnvironment(process.env);
  if (issues.length) {
    console.error(
      `[agentdesk] Readiness configuration error: ${issues.join(" ")}`,
    );
    return jsonResponse({ status: "unavailable" }, 503);
  }
  try {
    await getHealth();
    const response = jsonResponse({ status: "ok", database: "ok" });
    // Public release metadata only; never expose credentials or account settings.
    const revision = process.env.RENDER_GIT_COMMIT;
    if (revision && /^[a-f0-9]{40}$/i.test(revision))
      response.headers.set("X-AgentDesk-Revision", revision);
    response.headers.set(
      "X-AgentDesk-Copilot",
      enabled() ? "enabled" : "disabled",
    );
    return response;
  } catch {
    console.error(
      "[agentdesk] Database readiness failed or timed out. Check DATABASE_URL and the db:migrate / db:seed deploy logs.",
    );
    return jsonResponse({ status: "unavailable" }, 503);
  }
}
