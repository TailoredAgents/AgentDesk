import {
  errorResponse,
  jsonResponse,
  readJson,
  requireSameOrigin,
  rateLimit,
} from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { requirePilotSubject } from "@/lib/crm/pilot-auth";
import { findActor } from "@/lib/crm/service";
import {
  getWorkstyle,
  changeWorkstyle,
  workstyleCommand,
} from "@/lib/workstyle/service";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    const subject = await requirePilotSubject(),
      { db } = await getDatabase(),
      actor = await findActor(db, subject);
    const scope = {
      kind: "pilot" as const,
      memberId: actor.id,
      brokerageId: actor.brokerageId,
    };
    if (request.method === "GET")
      return jsonResponse(await getWorkstyle(db, scope));
    requireSameOrigin(request);
    rateLimit(`workstyle:${subject}`, 30, 60000);
    return jsonResponse(
      await changeWorkstyle(
        db,
        scope,
        await readJson(request, workstyleCommand),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
