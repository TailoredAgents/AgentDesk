"use client";

export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
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
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Please sign in to continue.");
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
