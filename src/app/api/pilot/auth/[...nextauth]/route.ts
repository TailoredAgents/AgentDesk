import { NextRequest } from "next/server";
import { handlers } from "@/lib/crm/pilot-auth";
import { pilotConfiguration } from "@/lib/crm/config";
import { jsonResponse } from "@/lib/auth";

export const runtime = "nodejs";
async function handle(request: NextRequest) {
  if (!pilotConfiguration().ready)
    return jsonResponse(
      { error: "Individual sign-in is not configured." },
      503,
    );
  // Do not let arbitrary forwarded Host headers control OAuth redirect destinations.
  const origin = new URL(process.env.APP_URL!).origin;
  const url = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    origin,
  );
  const headers = new Headers(request.headers);
  headers.set("host", url.host);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
  const canonical = new NextRequest(url, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.text() : undefined,
  });
  return request.method === "POST"
    ? handlers.POST(canonical)
    : handlers.GET(canonical);
}
export const GET = handle;
export const POST = handle;
