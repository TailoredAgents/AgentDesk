import { createHash } from "node:crypto";
import { ApiError } from "./auth";

type Pending = { fingerprint: string; result: Promise<unknown> };
const runtime = globalThis as typeof globalThis & {
  __agentdeskAIRequests?: Map<string, Pending>;
};
const requests = (runtime.__agentdeskAIRequests ??= new Map<string, Pending>());

/** Coalesce simultaneous retries; the database additionally enforces durable idempotency. */
export async function coalesceAIRequest<T>(
  key: string,
  input: unknown,
  operation: () => Promise<T>,
): Promise<T> {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const pending = requests.get(key);
  if (pending) {
    if (pending.fingerprint !== fingerprint)
      throw new ApiError(
        409,
        "This submission identifier belongs to different content. Start a new submission.",
        "request_conflict",
      );
    return pending.result as Promise<T>;
  }
  const result = Promise.resolve().then(operation);
  requests.set(key, { fingerprint, result });
  try {
    return await result;
  } finally {
    if (requests.get(key)?.result === result) requests.delete(key);
  }
}
