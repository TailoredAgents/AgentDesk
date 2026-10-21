import { z } from "zod";
import {
  ApiError,
  authConfiguration,
  errorResponse,
  issueSession,
  jsonResponse,
  passwordMatches,
  rateLimit,
  readJson,
  requireSameOrigin,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    // The global ceiling remains effective even when a client spoofs forwarding headers.
    rateLimit("login-global", 30, 15 * 60 * 1000);
    const ip =
      request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim()
        .slice(0, 80) ?? "unknown";
    rateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
    if (!authConfiguration().ready || authConfiguration().localBypass)
      throw new ApiError(
        503,
        "Set a workspace password and session secret on the server to enable sign-in.",
        "access_not_configured",
      );
    const input = await readJson(
      request,
      z.object({ password: z.string().min(1).max(256) }).strict(),
    );
    if (!passwordMatches(input.password))
      throw new ApiError(
        401,
        "That workspace password is not correct.",
        "invalid_credentials",
      );
    const response = jsonResponse({ ok: true });
    response.cookies.set(SESSION_COOKIE, issueSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
