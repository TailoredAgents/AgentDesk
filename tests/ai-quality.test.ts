import test from "node:test";
import assert from "node:assert/strict";
import { buildAIContext, buildProviderContext } from "../src/lib/ai-context";
import { coalesceAIRequest } from "../src/lib/ai-requests";
import {
  explicitSourceDates,
  groundedDueDate,
  sourceDateClarifications,
  validateMessageQuality,
} from "../src/lib/ai-quality";
import { validateAudioUpload } from "../src/lib/audio";
import { assertNoUnsupportedConfirmations } from "../src/lib/ai";
import { ApiError } from "../src/lib/auth";
import {
  fictionalAIWorkspace,
  professionalStyle,
  warmStyle,
} from "./fixtures/ai-scenarios";

test("AI context scopes every relationship record and excludes contact fields", () => {
  const data = fictionalAIWorkspace();
  data.tasks.push({
    ...data.tasks[0],
    id: "other-client",
    clientId: "eval-michael",
    agentId: "eval-sophie",
    propertyId: null,
    detail: "OTHER CLIENT PRIVATE DATA",
  });
  data.tasks.push({
    ...data.tasks[0],
    id: "other-property",
    propertyId: "another-home",
    detail: "OTHER PROPERTY PRIVATE DATA",
  });
  const commitment = {
    id: "eval-commitment",
    agentId: "eval-jordan",
    clientId: "eval-sarah",
    propertyId: "eval-willow",
    conversationId: null,
    kind: "question" as const,
    title: "Patio furniture question",
    detail: "Ask whether it should stay.",
    status: "open" as const,
    dueDate: null,
    sourceQuote: "Should the patio furniture stay?",
    createdAt: "2026-10-22T12:00:00Z",
    resolvedAt: null,
  };
  data.commitments.push(commitment, {
    ...commitment,
    id: "private-question",
    clientId: "eval-michael",
    agentId: "eval-sophie",
    detail: "OTHER CLIENT PRIVATE COMMITMENT",
  });
  const context = buildAIContext(
    data,
    "eval-jordan",
    "eval-sarah",
    "eval-willow",
    "Sarah requested a follow-up.",
  );
  const payload = JSON.stringify(buildProviderContext(context));
  assert.equal(context.relationship?.tasks.length, 1);
  assert.equal(context.relationship?.commitments.length, 1);
  assert.match(payload, /Patio furniture question/);
  assert.match(payload, /Prefers short text messages/);
  assert.match(payload, /directness/);
  assert.match(payload, /keep you posted/);
  for (const forbidden of [
    "OTHER CLIENT PRIVATE DATA",
    "OTHER PROPERTY PRIVATE DATA",
    "OTHER CLIENT PRIVATE COMMITMENT",
    "sarah-private@example.invalid",
    "555-0100",
    "875000",
  ])
    assert.equal(payload.includes(forbidden), false);
  assert.throws(
    () =>
      buildAIContext(data, "eval-sophie", "eval-sarah", "eval-willow", "note"),
    (error: unknown) =>
      error instanceof ApiError && error.code === "invalid_relationship",
  );
});

test("distinct agent profiles reach generation without being replaced by default voice", () => {
  const data = fictionalAIWorkspace();
  const warm = buildProviderContext(
    buildAIContext(data, "eval-jordan", "eval-sarah", "eval-willow", "note"),
  );
  const professional = buildProviderContext(
    buildAIContext(data, "eval-sophie", "eval-michael", null, "note"),
  );
  assert.deepEqual(warm.agent.communicationStyle, warmStyle);
  assert.deepEqual(professional.agent.communicationStyle, professionalStyle);
  assert.notDeepEqual(
    warm.agent.communicationStyle,
    professional.agent.communicationStyle,
  );
});

test("dates support explicit written years but never borrow another action's deadline", () => {
  const source =
    "Send the comparison on Friday, October 23, 2026. Photography is requested on 2026-10-27.";
  assert.equal(explicitSourceDates(source).length, 2);
  assert.equal(
    groundedDueDate(
      "2026-10-23",
      "Send the comparison on Friday, October 23, 2026.",
      source,
    ),
    "2026-10-23",
  );
  assert.equal(
    groundedDueDate(
      "2026-10-27",
      "Send the comparison on Friday, October 23, 2026.",
      source,
    ),
    null,
  );
  assert.equal(
    groundedDueDate("2026-10-27", "Photography is requested Tuesday.", source),
    null,
  );
  assert.equal(
    groundedDueDate("2026-10-27", "Photography on October 27.", source),
    null,
  );
});

test("conflicting weekday/date and unresolved alternatives require clarification", () => {
  const wrongWeekday = "Cleaning is booked Monday, October 27, 2026.";
  assert.equal(groundedDueDate("2026-10-27", wrongWeekday, wrongWeekday), null);
  assert.match(
    sourceDateClarifications(wrongWeekday)[0],
    /monday.*2026-10-27.*tuesday/,
  );
  const alternatives =
    "Photography could be 2026-10-27 or 2026-10-28; dates conflict.";
  assert.equal(groundedDueDate("2026-10-27", alternatives, alternatives), null);
});

test("message checks reject unsupported completion, promises, dates, times and generic openings", () => {
  const source =
    "I need to prepare and send the checklist. Photography has not been confirmed. No fees were discussed.";
  for (const message of [
    "I've sent the checklist.",
    "Your checklist has been sent.",
    "I guarantee your home will sell.",
    "Photography is on October 27, 2026.",
    "I will call at 2 pm.",
    "I'll send the checklist tomorrow.",
    "I'll call Wednesday.",
    "I hope this message finds you well.",
  ]) {
    assert.throws(() => validateMessageQuality(message, source));
  }
  assert.doesNotThrow(() =>
    validateMessageQuality(
      "I'll prepare the checklist and check on photography.",
      source,
      warmStyle,
    ),
  );
  assert.doesNotThrow(() =>
    validateMessageQuality(
      "I sent the checklist.",
      "I sent the checklist this morning.",
      warmStyle,
    ),
  );
  assert.doesNotThrow(() =>
    validateMessageQuality(
      "I've already sent the checklist.",
      "Sent Sarah the checklist.",
      warmStyle,
    ),
  );
  assert.doesNotThrow(() =>
    validateMessageQuality(
      "The comparison has been sent.",
      "The comparison has been sent to Michael.",
      warmStyle,
    ),
  );
  assert.throws(() =>
    validateMessageQuality(
      "I've sent the checklist.",
      "I have not sent the checklist.",
      warmStyle,
    ),
  );
});

test("tour requests and conflicting dates cannot become confirmed appointments", () => {
  assert.throws(() =>
    assertNoUnsupportedConfirmations(
      "Your tour is confirmed.",
      "Michael requested another tour, but the listing agent has not confirmed.",
    ),
  );
  assert.throws(() =>
    assertNoUnsupportedConfirmations(
      "Photography is booked.",
      "Photography might be October 28, 2026 or October 29, 2026; the dates conflict.",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoUnsupportedConfirmations(
      "I'll check the requested tour time.",
      "Michael requested another tour, but the listing agent has not confirmed.",
    ),
  );
});

test("simultaneous identical submissions share one provider operation; changed content conflicts", async () => {
  const key = crypto.randomUUID();
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    await waiting;
    return { packageId: "one-package" };
  };
  const first = coalesceAIRequest(key, { note: "same" }, operation);
  const second = coalesceAIRequest(key, { note: "same" }, operation);
  await assert.rejects(
    coalesceAIRequest(key, { note: "different" }, operation),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test("a failed provider operation can be retried with the same submission identifier", async () => {
  const key = crypto.randomUUID();
  await assert.rejects(
    coalesceAIRequest(key, "note", async () => {
      throw new Error("provider unavailable");
    }),
  );
  assert.equal(
    await coalesceAIRequest(key, "note", async () => "recovered"),
    "recovered",
  );
});

test("browser WebM, MP4 and Ogg containers retain correct extensions and omit private filenames", async () => {
  const files = [
    new File(
      [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0])],
      "private-client.webm",
      { type: "audio/webm;codecs=opus" },
    ),
    new File(
      [new Uint8Array([0, 0, 0, 20]), "ftypisom"],
      "private-client.mp4",
      { type: "audio/mp4;codecs=mp4a.40.2" },
    ),
    new File(["OggS", new Uint8Array([0, 0, 0])], "private-client.ogg", {
      type: "audio/ogg;codecs=opus",
    }),
  ];
  for (const file of files) {
    const normal = await validateAudioUpload(file);
    assert.equal(normal.name, `recording.${file.name.split(".").pop()}`);
    assert.equal(normal.type.includes(";"), false);
    assert.equal(normal.size, file.size);
  }
  await assert.rejects(
    validateAudioUpload(
      new File(["OggS audio"], "recording.webm", { type: "audio/webm" }),
    ),
  );
  await assert.rejects(
    validateAudioUpload(
      new File(["<html>not audio</html>"], "recording.ogg", {
        type: "audio/ogg",
      }),
    ),
  );
});
