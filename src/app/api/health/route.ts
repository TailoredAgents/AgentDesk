import { authConfiguration, jsonResponse } from "@/lib/auth";
import {
  validateDeploymentEnvironment,
  validateWorkspaceAccessEnvironment,
} from "@/lib/deployment-config";
import { getHealth } from "@/lib/repository";
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
    return jsonResponse({ status: "ok", database: "ok" });
  } catch {
    console.error(
      "[agentdesk] Database readiness failed or timed out. Check DATABASE_URL and the db:migrate / db:seed deploy logs.",
    );
    return jsonResponse({ status: "unavailable" }, 503);
  }
}
