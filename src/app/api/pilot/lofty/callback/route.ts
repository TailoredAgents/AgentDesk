import { NextRequest, NextResponse } from "next/server";
import { requirePilotSubject } from "@/lib/crm/pilot-auth";
import { crmService } from "@/lib/crm/runtime";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let outcome = "authorization_failed";
  try {
    const subject = await requirePilotSubject();
    const params = request.nextUrl.searchParams;
    const result = await (
      await crmService()
    ).finishAuthorization(
      subject,
      params.get("state") || "",
      request.cookies.get("agentdesk_lofty_oauth")?.value || "",
      params.get("code") || undefined,
      params.has("error"),
    );
    outcome = result.ok ? "connected" : result.code || outcome;
  } catch {
    /* Tokens, codes and provider responses must never enter logs or the redirect. */
  }
  const destination = new URL("/pilot", process.env.APP_URL || request.url);
  destination.searchParams.set("connection", outcome);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("agentdesk_lofty_oauth", "", {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https:"),
    sameSite: "lax",
    path: "/api/pilot/lofty",
    maxAge: 0,
  });
  return response;
}
