import { protectedRoute, readJson } from "@/lib/auth";
import { calendarInputSchema, confirmedTaskSchedule } from "@/lib/calendar";
import { setTaskCalendar } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRoute(request, async () => {
    const { id } = await context.params;
    const input = await readJson(request, calendarInputSchema);
    return setTaskCalendar(id, confirmedTaskSchedule(input), input.expectedWorkspaceRevision);
  }, true);
}
