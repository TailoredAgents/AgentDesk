import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { getWorkspace, proposeFactCorrection } from "@/lib/repository";

export const runtime = "nodejs";
export async function POST(
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
            requestId: z.uuid(),
            value: z.string().trim().min(1).max(1000),
            certainty: z.enum(["confirmed", "requested", "uncertain"]),
            effectiveDate: z.string().nullable(),
            retire: z.boolean(),
          })
          .strict(),
      );
      const packageId = await proposeFactCorrection(id, input);
      return { packageId, workspace: await getWorkspace() };
    },
    true,
  );
}
