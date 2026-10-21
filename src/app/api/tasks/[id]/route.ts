import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { updateTask } from "@/lib/repository";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return protectedRoute(
    request,
    async () => {
      const { id } = await context.params;
      const input = await readJson(
        request,
        z.object({ status: z.enum(["open", "done"]) }).strict(),
      );
      return updateTask(id, input.status);
    },
    true,
  );
}
