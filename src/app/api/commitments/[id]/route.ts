import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { updateCommitment } from "@/lib/repository";

export const runtime = "nodejs";
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
        z.object({ status: z.enum(["open", "resolved"]) }).strict(),
      );
      return updateCommitment(id, input.status);
    },
    true,
  );
}
