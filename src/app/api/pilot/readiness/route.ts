import { jsonResponse } from "@/lib/auth";
import { pilotConfiguration, loftyConfiguration } from "@/lib/crm/config";
export const dynamic = "force-dynamic";
export function GET() {
  return jsonResponse({
    pilotReady: pilotConfiguration().ready,
    connectionReady: loftyConfiguration().ready,
  });
}
