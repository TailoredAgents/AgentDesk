import { protectedRoute, readJson } from "@/lib/auth";
import { prepareWorkProduct, workProductInputSchema } from "@/lib/preparation";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () =>
      prepareWorkProduct(await readJson(request, workProductInputSchema)),
    true,
  );
}
