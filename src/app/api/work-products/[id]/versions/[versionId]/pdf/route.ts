import { requireAuth, errorResponse } from "@/lib/auth";
import { getWorkProductPdf } from "@/lib/repository";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    requireAuth(request);
    const { id, versionId } = await context.params;
    const saved = await getWorkProductPdf(id, versionId);
    const pdf = Buffer.from(saved.pdfBase64, "base64");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = saved.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${filename}"`, "Content-Length": String(pdf.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
