import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProposedAction } from "../src/lib/types";
import {
  selectedReviewDecisions,
  reviewEffect,
} from "../src/components/workspace/review-helpers";
import {
  chooseRecordingMime,
  recordingExtension,
  microphoneError,
  elapsedLabel,
} from "../src/components/workspace/recording-helpers";

const action = (
  id: string,
  status: ProposedAction["status"] = "pending",
): ProposedAction => ({
  id,
  status,
  kind: "task",
  title: "Confirm the requested photography time",
  body: "Ask the photographer about availability; no appointment is confirmed.",
  dueDate: "2026-10-23",
  sourceQuote: "The photographer has not confirmed.",
  certainty: "requested",
});

test("untouched and explicitly pending proposals never enter a review mutation", () => {
  assert.deepEqual(
    selectedReviewDecisions(
      [action("one"), action("two")],
      { two: "pending" },
      { one: "A local draft edit" },
      {},
    ),
    [],
  );
});

test("partial reviews preserve exact choices and edited dates without resubmitting saved actions", () => {
  const result = selectedReviewDecisions(
    [
      action("approve"),
      action("reject"),
      action("later"),
      action("saved", "approved"),
    ],
    { approve: "approved", reject: "rejected", saved: "approved" },
    { approve: "Call to confirm; no booking yet." },
    { approve: "", reject: "2026-10-24" },
  );
  assert.deepEqual(result, [
    {
      id: "approve",
      status: "approved",
      body: "Call to confirm; no booking yet.",
      dueDate: null,
    },
    {
      id: "reject",
      status: "rejected",
      body: action("reject").body,
      dueDate: "2026-10-24",
    },
  ]);
});

test("effect previews describe internal drafts and listing notes without implying sends or stage updates", () => {
  assert.match(
    reviewEffect({ ...action("message"), kind: "message" }, true),
    /draft; do not send/,
  );
  assert.match(
    reviewEffect({ ...action("listing"), kind: "listing_update" }, true),
    /note.*do not change its stage/,
  );
  assert.match(reviewEffect(action("task"), false), /client$/);
  assert.match(reviewEffect(action("task"), true), /client and listing$/);
});

test("browser MIME negotiation supports WebM, MP4 and Ogg without assigning a false extension", () => {
  for (const mime of [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    assert.equal(
      chooseRecordingMime((candidate) => candidate === mime),
      mime,
    );
  }
  assert.equal(
    chooseRecordingMime(() => false),
    null,
  );
  assert.equal(recordingExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(recordingExtension("audio/mp4"), "mp4");
  assert.equal(recordingExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(recordingExtension("audio/unknown"), null);
});

test("microphone failures distinguish denial, missing hardware and unavailable formats", () => {
  assert.match(
    microphoneError({ name: "NotAllowedError" }),
    /permission was denied/,
  );
  assert.match(
    microphoneError({ name: "NotFoundError" }),
    /No microphone was found/,
  );
  assert.match(
    microphoneError({ name: "NotReadableError" }),
    /another application/,
  );
  assert.match(
    microphoneError({ name: "NotSupportedError" }),
    /supported audio format/,
  );
  assert.match(
    microphoneError(new Error("unexpected")),
    /could not be completed/,
  );
  assert.equal(elapsedLabel(125), "02:05");
});
