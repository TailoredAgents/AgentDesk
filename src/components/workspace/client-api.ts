"use client";

export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "The connection was interrupted. Check your connection and retry; saved decisions will not be applied twice.",
    );
  }
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Please sign in to continue.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The service returned an unreadable response. Refresh to check saved work before retrying.",
    );
  }
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
