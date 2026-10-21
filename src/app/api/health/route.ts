import { authConfiguration, jsonResponse } from "@/lib/auth";
import { getHealth } from "@/lib/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getHealth();
    if (!authConfiguration().ready)
      return jsonResponse({ status: "unavailable" }, 503);
    return jsonResponse({ status: "ok", database: "ok" });
  } catch {
    console.error("[agentdesk] Health check failed");
    return jsonResponse({ status: "unavailable" }, 503);
  }
}
