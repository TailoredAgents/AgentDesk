import { protectedRoute, readJson } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { SAMPLE_WORKSPACE_ID } from "@/lib/db/seed-data";
import {
  getWorkstyle,
  changeWorkstyle,
  workstyleCommand,
} from "@/lib/workstyle/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return protectedRoute(request, async () =>
    getWorkstyle((await getDatabase()).db, {
      kind: "sample",
      workspaceId: SAMPLE_WORKSPACE_ID,
      agentId: (await context.params).id,
    }),
  );
}
export async function POST(request: Request, context: Context) {
  return protectedRoute(
    request,
    async () =>
      changeWorkstyle(
        (await getDatabase()).db,
        {
          kind: "sample",
          workspaceId: SAMPLE_WORKSPACE_ID,
          agentId: (await context.params).id,
        },
        await readJson(request, workstyleCommand),
      ),
    true,
  );
}
