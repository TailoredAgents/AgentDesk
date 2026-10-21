import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateWorkspaceAccessEnvironment } from "./deployment-config";

export const SESSION_COOKIE = "agentdesk_session";
export const SESSION_SECONDS = 12 * 60 * 60;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}

export function authConfiguration() {
  const password = process.env.DEMO_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  const localBypass =
    process.env.NODE_ENV !== "production" && !password && !secret;
  return {
    password,
    secret,
    localBypass,
    ready:
      localBypass ||
      validateWorkspaceAccessEnvironment(process.env).length === 0,
  };
}

function signingKey() {
  const config = authConfiguration();
  if (!config.ready || !config.password || !config.secret)
    throw new ApiError(
      503,
      "Workspace access is not configured. Contact the workspace owner.",
      "access_not_configured",
    );
  return `${config.secret}:${createHash("sha256").update(config.password).digest("hex")}`;
}

export function issueSession(now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      iat: now,
      exp: now + SESSION_SECONDS * 1000,
      nonce: randomBytes(24).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey()).update(payload).digest("base64url")}`;
}

export function verifySession(token: string | undefined, now = Date.now()) {
  if (
    !token ||
    token.length > 1024 ||
    !authConfiguration().ready ||
    authConfiguration().localBypass
  )
    return false;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    const expected = createHmac("sha256", signingKey())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
      return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (
      Number.isSafeInteger(data.iat) &&
      Number.isSafeInteger(data.exp) &&
      data.iat <= now &&
      data.exp > now &&
      data.exp - data.iat === SESSION_SECONDS * 1000 &&
      typeof data.nonce === "string"
    );
  } catch {
    return false;
  }
}

export function passwordMatches(candidate: string) {
  const expected = process.env.DEMO_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export function sessionCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export function isAuthorized(request: Request) {
  const config = authConfiguration();
  if (!config.ready) return false;
  if (config.localBypass)
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(request.url).hostname,
    );
  return verifySession(sessionCookie(request));
}

export function requireAuth(request: Request) {
  if (!authConfiguration().ready)
    throw new ApiError(
      503,
      "Workspace access is not configured. Contact the workspace owner.",
      "access_not_configured",
    );
  if (!isAuthorized(request))
    throw new ApiError(401, "Sign in to open this workspace.", "unauthorized");
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url);
  let localAlias = false;
  if (origin && process.env.NODE_ENV !== "production") {
    try {
      const actual = new URL(origin);
      const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
      // Next normalizes local request URLs to localhost even when the browser uses 127.0.0.1.
      localAlias =
        local.has(actual.hostname) &&
        local.has(expected.hostname) &&
        actual.protocol === expected.protocol &&
        actual.port === expected.port &&
        actual.origin === origin;
    } catch {
      /* malformed and opaque origins are rejected below */
    }
  }
  if (
    !origin ||
    (origin !== expected.origin && !localAlias) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new ApiError(
      403,
      "This request must come from your AgentDesk workspace.",
      "invalid_origin",
    );
  }
}

type RateBucket = { count: number; resetAt: number };
const globalRate = globalThis as unknown as {
  agentdeskRates?: Map<string, RateBucket>;
};
const buckets = (globalRate.agentdeskRates ??= new Map<string, RateBucket>());

// This pilot uses one process. Use a shared limiter before scaling to multiple instances.
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  if (buckets.size > 2000)
    for (const [id, bucket] of buckets)
      if (bucket.resetAt <= now) buckets.delete(id);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit)
    throw new ApiError(
      429,
      "Please wait a little before trying again.",
      "rate_limited",
    );
  bucket.count += 1;
}

export function limitAI() {
  rateLimit("workspace-ai", 20, 10 * 60 * 1000);
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes)
    throw new ApiError(413, "This upload is too large.", "payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          413,
          "This upload is too large.",
          "payload_too_large",
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(415, "Send a JSON request.", "invalid_content_type");
  const body = await readBoundedBody(request, 256 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch {
    throw new ApiError(
      400,
      "The request could not be read. Please try again.",
      "invalid_json",
    );
  }
  return schema.parse(value);
}

export function jsonResponse(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return jsonResponse(
      {
        error: "Check the submitted fields and try again.",
        code: "invalid_input",
        fields: error.issues.map((issue) => issue.path.join(".")),
      },
      400,
    );
  if (error instanceof ApiError)
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
    );
  // Repository domain errors are designed for display; never expose driver/provider errors.
  if (
    error instanceof Error &&
    error.name === "DomainError" &&
    "status" in error &&
    "code" in error
  ) {
    const domain = error as Error & { status: number; code: string };
    return jsonResponse(
      { error: domain.message, code: domain.code },
      domain.status,
    );
  }
  console.error("[agentdesk] Request failed", {
    type: error instanceof Error ? error.constructor.name : "UnknownError",
  });
  return jsonResponse(
    {
      error: "Something went wrong. Please try again.",
      code: "internal_error",
    },
    500,
  );
}

export async function protectedRoute(
  request: Request,
  operation: () => Promise<unknown>,
  mutate = false,
) {
  try {
    requireAuth(request);
    if (mutate) requireSameOrigin(request);
    return jsonResponse(await operation());
  } catch (error) {
    return errorResponse(error);
  }
}
