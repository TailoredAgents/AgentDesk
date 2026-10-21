import { protectedRoute } from "@/lib/auth";
import { getCapabilities } from "@/lib/integrations";
import { getWorkspace } from "@/lib/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return protectedRoute(request, async () => ({
    ...(await getWorkspace()),
    capabilities: getCapabilities(),
  }));
}
