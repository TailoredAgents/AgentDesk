import { z } from "zod";
import { protectedRoute, readJson } from "@/lib/auth";
import { editWorkProductVersion } from "@/lib/repository";
import { workProductContentSchema } from "@/lib/work-product-schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  return protectedRoute(request, async () => {
    const { id, versionId } = await context.params;
    const input = await readJson(request, z.object({ content: workProductContentSchema, expectedEditRevision: z.number().int().nonnegative() }).strict());
    return editWorkProductVersion(id, versionId, input);
  }, true);
}
