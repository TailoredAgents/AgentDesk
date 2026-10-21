import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { updateAgentStyle } from "@/lib/repository";
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
        z
          .object({
            tone: z.string().trim().min(1).max(300),
            length: z.string().trim().min(1).max(200),
            avoid: z.string().max(1500),
            examples: z.string().max(6000),
          })
          .strict(),
      );
      return updateAgentStyle(id, input);
    },
    true,
  );
}
