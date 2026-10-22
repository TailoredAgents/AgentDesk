import { ApiError, requireAuth, errorResponse } from "@/lib/auth";
import { createCalendarFile } from "@/lib/calendar";
import { getWorkspace } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    requireAuth(request);
    const query = new URL(request.url).searchParams;
    const type = query.get("type"), id = query.get("id");
    if (!id || id.length > 120 || (type !== "task" && type !== "appointment")) throw new ApiError(400, "Choose a task or appointment.", "invalid_input");
    const data = await getWorkspace();
    const record = type === "task" ? data.tasks.find((task) => task.id === id) : data.appointments.find((appointment) => appointment.id === id);
    if (!record) throw new ApiError(404, "This record is not available in the workspace.", "not_found");
    const file = createCalendarFile({ workspaceId: data.workspace.id, type, record });
    return new Response(file, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="agentdesk-calendar.ics"', "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
