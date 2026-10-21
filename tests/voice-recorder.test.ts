import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VoiceRecorderController,
  type RecordingState,
} from "../src/components/workspace/voice-recorder-controller";

function harness(
  options: { denied?: string; unsupported?: boolean; deferred?: boolean } = {},
) {
  let trackStops = 0;
  let permissionRequests = 0;
  let recorderStops = 0;
  let resolvePermission!: (stream: MediaStream) => void;
  const states: RecordingState[] = [];
  const errors: string[] = [];
  const recordings: File[] = [];
  const input = {
    getTracks: () => [
      {
        stop: () => {
          trackStops += 1;
        },
      },
    ],
  } as unknown as MediaStream;
  const fake = {
    state: "inactive",
    mimeType: "audio/ogg;codecs=opus",
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null as (() => void) | null,
    start: () => {
      fake.state = "recording";
    },
    stop: () => {
      recorderStops += 1;
      fake.state = "inactive";
    },
  };
  const pendingPermission = new Promise<MediaStream>((resolve) => {
    resolvePermission = resolve;
  });
  const controller = new VoiceRecorderController({
    requestStream: async () => {
      permissionRequests += 1;
      if (options.denied) {
        const error = new Error("Unavailable");
        error.name = options.denied;
        throw error;
      }
      return options.deferred ? pendingPermission : input;
    },
    createRecorder: () => fake as unknown as MediaRecorder,
    supports: (mime) => !options.unsupported && mime === fake.mimeType,
    onState: (state) => states.push(state),
    onElapsed: () => {},
    onError: (error) => errors.push(error),
    onRecording: (file) => recordings.push(file),
  });
  return {
    controller,
    fake,
    states,
    errors,
    recordings,
    input,
    resolvePermission,
    counts: () => ({ trackStops, permissionRequests, recorderStops }),
  };
}

test("a permission denial returns to idle without creating an audio submission", async () => {
  const h = harness({ denied: "NotAllowedError" });
  await h.controller.start();
  assert.equal(h.states.at(-1), "idle");
  assert.match(h.errors[0], /permission was denied/);
  assert.equal(h.recordings.length, 0);
  assert.equal(h.counts().permissionRequests, 1);
  h.controller.dispose();
});

test("unsupported formats never request microphone access", async () => {
  const h = harness({ unsupported: true });
  await h.controller.start();
  assert.equal(h.counts().permissionRequests, 0);
  assert.match(h.errors[0], /supported audio format/);
  h.controller.dispose();
});

test("late permission after closing releases every track without starting a recorder", async () => {
  const h = harness({ deferred: true });
  const start = h.controller.start();
  h.controller.dispose();
  const before = h.states.length;
  h.resolvePermission(h.input);
  await start;
  assert.deepEqual(h.counts(), {
    trackStops: 1,
    permissionRequests: 1,
    recorderStops: 0,
  });
  assert.equal(h.states.length, before);
  assert.equal(h.recordings.length, 0);
});

test("stop releases the microphone immediately and retains the final chunk with its true MIME", async () => {
  const h = harness();
  await h.controller.start();
  await h.controller.start(); // Rapid duplicate clicks share one permission request.
  h.fake.ondataavailable?.({
    data: new Blob(["first"], { type: h.fake.mimeType }),
  });
  h.controller.stop();
  assert.deepEqual(h.counts(), {
    trackStops: 1,
    permissionRequests: 1,
    recorderStops: 1,
  });
  h.fake.ondataavailable?.({
    data: new Blob(["last"], { type: h.fake.mimeType }),
  });
  h.fake.onstop?.();
  assert.equal(h.states.at(-1), "idle");
  assert.equal(h.recordings[0].name, "voice-note.ogg");
  assert.equal(h.recordings[0].type, "audio/ogg;codecs=opus");
  assert.equal(await h.recordings[0].text(), "firstlast");
  h.controller.dispose();
});

test("recorder failure discards partial audio and releases its tracks", async () => {
  const h = harness();
  await h.controller.start();
  h.fake.ondataavailable?.({ data: new Blob(["partial"]) });
  h.fake.onerror?.();
  assert.equal(h.counts().trackStops, 1);
  assert.equal(h.states.at(-1), "idle");
  assert.equal(h.recordings.length, 0);
  assert.match(h.errors[0], /recording failed/);
  assert.equal(h.fake.onstop, null);
  h.controller.dispose();
});

test("unmount during recording detaches handlers and stops recording and every track", async () => {
  const h = harness();
  await h.controller.start();
  h.controller.dispose();
  assert.equal(h.counts().recorderStops, 1);
  assert.equal(h.counts().trackStops, 1);
  assert.equal(h.fake.ondataavailable, null);
  assert.equal(h.fake.onstop, null);
  assert.equal(h.fake.onerror, null);
  assert.equal(h.recordings.length, 0);
});

test("oversized recording is discarded before it can become an upload", async () => {
  const h = harness();
  await h.controller.start();
  h.fake.ondataavailable?.({
    data: new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]),
  });
  assert.equal(h.recordings.length, 0);
  assert.equal(h.counts().trackStops, 1);
  assert.match(h.errors[0], /exceeded 20 MB/);
  h.controller.dispose();
});
