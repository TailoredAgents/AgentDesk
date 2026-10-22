import { NextResponse } from "next/server";
import { errorResponse, requireSameOrigin, rateLimit } from "@/lib/auth";
import { requirePilotSubject } from "@/lib/crm/pilot-auth";
import { crmService } from "@/lib/crm/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const subject = await requirePilotSubject();
    requireSameOrigin(request);
    rateLimit(`lofty-oauth:${subject}`, 5, 600_000);
    const result = await (await crmService()).startAuthorization(subject);
    const response = NextResponse.json(
      { authorizationUrl: result.authorizationUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set("agentdesk_lofty_oauth", result.browserNonce, {
      httpOnly: true,
      secure: process.env.APP_URL?.startsWith("https:"),
      sameSite: "lax",
      path: "/api/pilot/lofty",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
