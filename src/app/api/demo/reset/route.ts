import { z } from "zod";
import { protectedRoute, rateLimit, readJson } from "@/lib/auth";
import { resetSampleWorkspace } from "@/lib/repository";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () => {
      const input = await readJson(
        request,
        z
          .object({ confirmation: z.literal("RESTORE FICTIONAL WORKSPACE") })
          .strict(),
      );
      rateLimit("sample-reset", 3, 60_000);
      return resetSampleWorkspace(input.confirmation);
    },
    true,
  );
}
