import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, protectedRoute, readJson, rateLimit } from "@/lib/auth";
import { getWorkspace, reviewWorkProductVersion } from "@/lib/repository";
import { workProductContentSchema } from "@/lib/work-product-schema";
import { validateWorkProductContent } from "@/lib/work-product-content";
import { renderWorkProductPdf } from "@/lib/work-product-pdf";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  return protectedRoute(request, async () => {
    const { id, versionId } = await context.params;
    const input = await readJson(request, z.object({ decision: z.enum(["approved", "rejected"]), content: workProductContentSchema.optional(), expectedEditRevision: z.number().int().nonnegative() }).strict());
    const data = await getWorkspace();
    const product = data.workProducts.find((item) => item.id === id);
    const version = product?.versions.find((item) => item.id === versionId);
    if (!product || !version) throw new ApiError(404, "Work product version not found.", "not_found");
    // A retried completed decision is checked by the repository without rendering again.
    if (version.status !== "pending" || input.decision === "rejected") return reviewWorkProductVersion(id, versionId, input);
    if (version.editRevision !== input.expectedEditRevision) throw new ApiError(409, "This draft changed. Refresh it before approving.", "stale_revision");
    const content = validateWorkProductContent(input.content ?? version.content, version.snapshot, { humanEdited: true });
    rateLimit("workspace-pdf", 30, 10 * 60 * 1000);
    let pdf: Buffer;
    try {
      pdf = await renderWorkProductPdf({ productId: id, kind: product.kind, version: version.version, content, snapshot: version.snapshot, createdAt: version.createdAt });
    } catch {
      throw new ApiError(500, "The PDF could not be generated. Your draft remains available for review; please try again.", "pdf_generation_failed");
    }
    return reviewWorkProductVersion(id, versionId, { ...input, content, pdfBase64: pdf.toString("base64"), pdfSha256: createHash("sha256").update(pdf).digest("hex") });
  }, true);
}
