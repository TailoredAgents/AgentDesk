import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ApiError,
  authConfiguration,
  isAuthorized,
  issueSession,
  passwordMatches,
  rateLimit,
  readBoundedBody,
  readJson,
  requireSameOrigin,
  SESSION_SECONDS,
  verifySession,
} from "../src/lib/auth";
import {
  assertNoUnsupportedConfirmations,
  isSourceQuote,
  transcribeAudio,
  validateGrounding,
  type GeneratedPackage,
} from "../src/lib/ai";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";

async function withAuthEnvironment(operation: () => void | Promise<void>) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DEMO_PASSWORD: process.env.DEMO_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
    APP_URL: process.env.APP_URL,
  };
  Object.assign(process.env, {
    NODE_ENV: "production",
    DEMO_PASSWORD: "test-password-long-enough",
    SESSION_SECRET: "test-session-secret-at-least-thirty-two-chars",
    APP_URL: "https://agentdesk.example",
  });
  try {
    await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("signed sessions reject tampering, expiry, future issuance and password rotation", () =>
  withAuthEnvironment(() => {
    const now = 100000;
    const token = issueSession(now);
    assert.equal(verifySession(token, now), true);
    assert.equal(verifySession(`${token.slice(0, -4)}xxxx`, now), false);
    assert.equal(verifySession(token, now + SESSION_SECONDS * 1000), false);
    assert.equal(verifySession(token, now - 1), false);
    assert.equal(verifySession(token + ".extra", now), false);
    process.env.DEMO_PASSWORD = "a-different-valid-password";
    assert.equal(verifySession(token, now), false);
  }));

test("production fails closed without secrets and development bypass is local only", () =>
  withAuthEnvironment(() => {
    delete process.env.DEMO_PASSWORD;
    delete process.env.SESSION_SECRET;
    assert.equal(authConfiguration().ready, false);
    assert.equal(isAuthorized(new Request("http://localhost:3000")), false);
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(isAuthorized(new Request("http://localhost:3000")), true);
    assert.equal(isAuthorized(new Request("https://public.example")), false);
    process.env.DEMO_PASSWORD = "configured-password";
    assert.equal(authConfiguration().ready, false);
  }));

test("password matching rejects arbitrary and oversized candidates", () =>
  withAuthEnvironment(() => {
    assert.equal(passwordMatches("test-password-long-enough"), true);
    assert.equal(passwordMatches("not-the-password"), false);
    assert.equal(passwordMatches("x".repeat(1000)), false);
  }));

test("mutations require the canonical application origin", () =>
  withAuthEnvironment(() => {
    assert.doesNotThrow(() =>
      requireSameOrigin(
        new Request("http://internal:3000/api/tasks/1", {
          headers: { origin: "https://agentdesk.example" },
        }),
      ),
    );
    for (const origin of [
      "",
      "null",
      "https://attacker.example",
      "https://agentdesk.example.evil.test",
    ]) {
      assert.throws(
        () =>
          requireSameOrigin(
            new Request("https://agentdesk.example/api/tasks/1", {
              headers: { origin },
            }),
          ),
        (error: unknown) => error instanceof ApiError && error.status === 403,
      );
    }
    assert.throws(() =>
      requireSameOrigin(
        new Request("https://agentdesk.example/api/tasks/1", {
          headers: {
            origin: "https://agentdesk.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    );
  }));

test("sign-in issues a protected cookie and sign-out clears it", () =>
  withAuthEnvironment(async () => {
    const response = await login(
      new Request("https://agentdesk.example/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://agentdesk.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "test-password-long-enough" }),
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /Max-Age=43200/i);
    assert.equal(
      isAuthorized(
        new Request("https://agentdesk.example/api/workspace", {
          headers: { cookie: cookie.split(";")[0] },
        }),
      ),
      true,
    );
    const ended = await logout(
      new Request("https://agentdesk.example/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://agentdesk.example" },
      }),
    );
    assert.equal(ended.status, 200);
    assert.match(ended.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  }));

test("development permits Next loopback normalization without allowing another origin or port", () =>
  withAuthEnvironment(() => {
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.APP_URL;
    assert.doesNotThrow(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/task", {
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
    );
    assert.throws(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/task", {
          headers: { origin: "http://127.0.0.1:4000" },
        }),
      ),
    );
    assert.throws(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/task", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    );
    assert.throws(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/task", {
          headers: { origin: "http://127.0.0.1:3000/path" },
        }),
      ),
    );
  }));

test("sign-in rejects a cross-site request before accepting credentials", () =>
  withAuthEnvironment(async () => {
    const response = await login(
      new Request("https://agentdesk.example/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "test-password-long-enough" }),
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }));

test("rate limits enforce a finite budget and reset at the window boundary", () => {
  const key = `test:${crypto.randomUUID()}`;
  rateLimit(key, 2, 1000, 100);
  rateLimit(key, 2, 1000, 101);
  assert.throws(
    () => rateLimit(key, 2, 1000, 102),
    (error: unknown) => error instanceof ApiError && error.status === 429,
  );
  assert.doesNotThrow(() => rateLimit(key, 2, 1000, 1100));
});

test("body reader bounds uploads even with no Content-Length", async () => {
  await assert.rejects(
    readBoundedBody(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: "x".repeat(50),
      }),
      20,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  );
  const result = await readBoundedBody(
    new Request("http://localhost/api/test", { method: "POST", body: "fine" }),
    20,
  );
  assert.equal(result.toString(), "fine");
});

test("JSON validation rejects invalid content type, malformed JSON and missing consent", async () => {
  const schema = z.object({ authorized: z.literal(true) });
  await assert.rejects(
    readJson(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      schema,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 415,
  );
  await assert.rejects(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad",
      }),
      schema,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
  await assert.rejects(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"authorized":false}',
      }),
      schema,
    ),
  );
});

const transcript =
  "Sarah wants photography on Tuesday afternoon, but the photographer has not confirmed. Cleaning is booked for Monday. Send Sarah a preparation checklist.";
function draft(): GeneratedPackage {
  return {
    summary:
      "Cleaning is booked for Monday. Photography is requested for Tuesday, awaiting confirmation.",
    facts: [
      {
        text: "Photography is requested for Tuesday.",
        certainty: "requested",
        sourceQuote: "Sarah wants photography on Tuesday afternoon",
      },
    ],
    clarifications: [],
    actions: [
      {
        kind: "message",
        title: "Follow up with Sarah",
        body: "Hey Sarah! I am checking on photography for Tuesday and will let you know once it is confirmed.",
        dueDate: null,
        sourceQuote: "the photographer has not confirmed",
        certainty: "uncertain",
      },
      {
        kind: "task",
        title: "Prepare a checklist",
        body: "Prepare and share the preparation checklist.",
        dueDate: null,
        sourceQuote: "Send Sarah a preparation checklist.",
        certainty: "confirmed",
      },
    ],
  };
}

test("grounding requires contiguous evidence from the actual source", () => {
  assert.equal(
    isSourceQuote("photographer has not confirmed", transcript),
    true,
  );
  assert.equal(isSourceQuote("photographer confirmed", transcript), false);
  const data = draft();
  data.actions[0].sourceQuote = "Tuesday appointment is confirmed";
  assert.throws(
    () => validateGrounding(data, transcript),
    (error: unknown) =>
      error instanceof ApiError && error.code === "ungrounded_output",
  );
});

test("AI cannot assign a calendar date from a relative weekday or invent money/attachments", () => {
  const dateDraft = draft();
  dateDraft.actions[1].dueDate = "2026-10-26";
  assert.equal(
    validateGrounding(dateDraft, transcript).actions[1].dueDate,
    null,
  );
  const invalidDate = draft();
  invalidDate.actions[1].dueDate = "2026-99-99";
  assert.equal(
    validateGrounding(invalidDate, transcript + " 2026-99-99").actions[1]
      .dueDate,
    null,
  );
  const priceDraft = draft();
  priceDraft.actions[0].body += " The price will be $875,000.";
  assert.throws(
    () => validateGrounding(priceDraft, transcript),
    (error: unknown) =>
      error instanceof ApiError && error.code === "ungrounded_output",
  );
  const partialPriceDraft = draft();
  partialPriceDraft.actions[0].body += " The price will be $875.";
  assert.throws(() =>
    validateGrounding(
      partialPriceDraft,
      transcript + " The asking price is $875,000.",
    ),
  );
  const attachmentDraft = draft();
  attachmentDraft.actions[0].body += " I have attached the checklist.";
  assert.throws(() => validateGrounding(attachmentDraft, transcript));
});

test("tentative source evidence cannot stay labelled confirmed", () => {
  const data = draft();
  data.facts[0] = {
    text: "Photography needs confirmation.",
    certainty: "confirmed",
    sourceQuote: "the photographer has not confirmed",
  };
  const result = validateGrounding(data, transcript);
  assert.equal(result.facts[0].certainty, "uncertain");
  assert.equal(result.clarifications.length, 1);
});

test("an unconfirmed photography source cannot produce an affirmative booking in a message", () => {
  const data = draft();
  // A cautious metadata flag is insufficient when the actual client-facing copy is wrong.
  data.actions[0].certainty = "uncertain";
  data.actions[0].body =
    "Hey Sarah! Photography is booked for Tuesday afternoon.";
  assert.throws(
    () => validateGrounding(data, transcript),
    (error: unknown) =>
      error instanceof ApiError && error.code === "ungrounded_output",
  );
  assert.throws(() =>
    assertNoUnsupportedConfirmations(
      "Photography update: it is confirmed for Tuesday.",
      transcript,
    ),
  );
  assert.throws(() =>
    assertNoUnsupportedConfirmations(
      "The photographer is all set for Tuesday.",
      transcript,
    ),
  );
});

test("confirmed cleaning and qualified photography language can coexist", () => {
  assert.doesNotThrow(() =>
    assertNoUnsupportedConfirmations(
      "Cleaning is booked for Monday. I will let you know once photography is confirmed for Tuesday.",
      transcript,
    ),
  );
  assert.doesNotThrow(() =>
    assertNoUnsupportedConfirmations(
      "Photography is not confirmed yet. Cleaning is booked for Monday.",
      transcript,
    ),
  );
  assert.doesNotThrow(() =>
    assertNoUnsupportedConfirmations(
      "Photography is booked for Tuesday.",
      transcript + " The photographer has now confirmed Tuesday.",
    ),
  );
});

test("live AI reports unavailability without credentials instead of returning sample output", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      transcribeAudio(new File(["audio"], "test.mp3", { type: "audio/mpeg" })),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 503 &&
        error.code === "ai_not_configured",
    );
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});
