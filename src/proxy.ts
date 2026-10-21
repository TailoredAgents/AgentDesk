import { NextRequest, NextResponse } from "next/server";
import { authConfiguration, isAuthorized } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path === "/login" ||
    path === "/api/health" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout"
  )
    return NextResponse.next();
  if (isAuthorized(request)) return NextResponse.next();
  if (path.startsWith("/api/"))
    return NextResponse.json(
      {
        error: authConfiguration().ready
          ? "Sign in to open this workspace."
          : "Workspace access is not configured.",
        code: "unauthorized",
      },
      { status: authConfiguration().ready ? 401 : 503 },
    );
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|images/|fonts/).*)",
  ],
};
