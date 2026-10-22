import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, limitAI, protectedRoute, readJson } from "@/lib/auth";
import { coalesceAIRequest } from "@/lib/ai-requests";
import { createWorkProductDraft, findWorkProductByRequestId, getWorkspace } from "@/lib/repository";
import { buildWorkProductContext, validateWorkProductContent } from "@/lib/work-product-content";
import { generateWorkProduct } from "@/lib/work-product-ai";

export const runtime = "nodejs";
export const maxDuration = 120;
const id = z.string().min(1).max(120);
const inputSchema = z.object({
  kind: z.enum(["seller_preparation", "appointment_briefing"]),
  agentId: id,
  clientId: id.nullable().optional(),
  propertyId: id.nullable().optional(),
  sourcePackageId: id.nullable().optional(),
  appointmentId: id.nullable().optional(),
  productId: id.optional(),
  copyVersionId: id.optional(),
  requestId: z.uuid(),
}).strict();

export async function POST(request: Request) {
  return protectedRoute(request, async () => {
    const input = await readJson(request, inputSchema);
    const data = await getWorkspace();
    const requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return coalesceAIRequest(`${data.workspace.id}:work-product:${input.requestId}`, input, async () => {
      const previous = await findWorkProductByRequestId(input.requestId);
      if (previous) {
        if (previous.requestFingerprint !== requestFingerprint) throw new ApiError(409, "This request identifier belongs to different work. Start a new request.", "request_conflict");
        return { productId: previous.productId, versionId: previous.versionId, workspace: await getWorkspace() };
      }
      const product = input.productId ? data.workProducts.find((item) => item.id === input.productId) : undefined;
      if (input.productId && !product) throw new ApiError(404, "Work product not found.", "not_found");
      if (product && (input.kind !== product.kind || input.agentId !== product.agentId || ["clientId", "propertyId", "sourcePackageId", "appointmentId"].some((key) => input[key as keyof typeof input] !== undefined && input[key as keyof typeof input] !== product[key as keyof typeof product]))) throw new ApiError(400, "The selected records do not belong to this work product.", "invalid_links");
      const links = {
        kind: input.kind, agentId: input.agentId,
        clientId: product?.clientId ?? input.clientId ?? null,
        propertyId: product?.propertyId ?? input.propertyId ?? null,
        sourcePackageId: product?.sourcePackageId ?? input.sourcePackageId ?? null,
        appointmentId: product?.appointmentId ?? input.appointmentId ?? null,
        sourceConversationId: product?.sourceConversationId ?? null,
      };
      const copy = input.copyVersionId ? product?.versions.find((version) => version.id === input.copyVersionId) : undefined;
      if (input.copyVersionId && !copy) throw new ApiError(404, "Choose a saved version to copy.", "not_found");
      if (!copy) limitAI();
      // A manual copy keeps the evidence retained by that version. AI regeneration
      // explicitly reads current records and receives a newly validated snapshot.
      const context = copy ? null : buildWorkProductContext(data, links);
      const snapshot = copy?.snapshot ?? context!.snapshot;
      const content = copy ? validateWorkProductContent(copy.content, snapshot, { humanEdited: true }) : await generateWorkProduct(context!);
      return createWorkProductDraft({
        ...links,
        clientId: snapshot.client?.id ?? null,
        propertyId: snapshot.property?.id ?? null,
        sourceConversationId: links.sourceConversationId || (links.sourcePackageId ? data.packages.find((pkg) => pkg.id === links.sourcePackageId)?.conversationId : null) || null,
        content, snapshot, requestId: input.requestId, requestFingerprint,
        productId: input.productId,
        copyVersionId: input.copyVersionId,
        origin: copy?.origin || "openai",
        expectedWorkspaceRevision: data.workspace.revision ?? 0,
      });
    });
  }, true);
}
