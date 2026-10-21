import {
  errorResponse,
  jsonResponse,
  requireSameOrigin,
  SESSION_COOKIE,
} from "@/lib/auth";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const response = jsonResponse({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
