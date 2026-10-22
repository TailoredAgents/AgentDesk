import { z } from "zod";
import {
  errorResponse,
  jsonResponse,
  rateLimit,
  readJson,
  requireSameOrigin,
} from "@/lib/auth";
import { requirePilotSubject } from "@/lib/crm/pilot-auth";
import { crmService } from "@/lib/crm/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().regex(/^[1-9]\d{0,18}$/);
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("review_message"),
      workId: z.uuid(),
      body: z.string().trim().min(3).max(2500),
    })
    .strict(),
  z.object({ action: z.enum(["sync", "disconnect"]) }).strict(),
  z.object({ action: z.literal("refresh"), leadId: id }).strict(),
  z
    .object({
      action: z.literal("propose"),
      requestId: z.string().min(16).max(100),
      proposal: z.unknown(),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      writeId: z.uuid(),
      approve: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.enum(["execute", "confirm"]), writeId: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal("prepare"),
      leadId: id,
      requestId: z.string().min(16).max(100),
      transcript: z.string().max(16000),
    })
    .strict(),
  z
    .object({
      action: z.literal("fact"),
      workId: z.uuid(),
      candidate: z.number().int().min(0).max(9),
      replaceExisting: z.boolean(),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const subject = await requirePilotSubject();
    const service = await crmService();
    const leadId = new URL(request.url).searchParams.get("leadId");
    return jsonResponse(
      leadId
        ? await service.leadContext(subject, id.parse(leadId))
        : await service.status(subject),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const subject = await requirePilotSubject();
    requireSameOrigin(request);
    rateLimit(`crm:${subject}`, 60, 60_000);
    const body = await readJson(request, command),
      service = await crmService();
    switch (body.action) {
      case "review_message":
        return jsonResponse(
          await service.reviewMessage(subject, body.workId, body.body),
        );
      case "sync":
        return jsonResponse(await service.sync(subject));
      case "disconnect":
        return jsonResponse(await service.disconnect(subject));
      case "refresh":
        return jsonResponse(await service.refreshLead(subject, body.leadId));
      case "propose":
        return jsonResponse(
          await service.propose(subject, body.requestId, body.proposal),
        );
      case "review":
        return jsonResponse(
          await service.review(subject, body.writeId, body.approve),
        );
      case "execute":
        return jsonResponse(await service.execute(subject, body.writeId));
      case "confirm":
        return jsonResponse(await service.confirm(subject, body.writeId));
      case "prepare":
        rateLimit(`crm-ai:${subject}`, 10, 600_000);
        return jsonResponse(
          await service.prepare(
            subject,
            body.leadId,
            body.requestId,
            body.transcript,
          ),
        );
      case "fact":
        return jsonResponse(
          await service.reviewFact(
            subject,
            body.workId,
            body.candidate,
            body.replaceExisting,
          ),
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
