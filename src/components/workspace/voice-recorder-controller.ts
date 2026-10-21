import {
  chooseRecordingMime,
  MAX_AUDIO_BYTES,
  microphoneError,
  recordingExtension,
} from "./recording-helpers";

export type RecordingState = "idle" | "requesting" | "recording" | "stopping";
type Dependencies = {
  requestStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mime: string) => MediaRecorder;
  supports: (mime: string) => boolean;
  onState: (state: RecordingState) => void;
  onElapsed: (seconds: number) => void;
  onRecording: (file: File) => void;
  onError: (message: string) => void;
};

/** Owns every microphone resource, including permissions that resolve after closing. */
export class VoiceRecorderController {
  private generation = 0;
  private active = false;
  private disposed = false;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dependencies: Dependencies) {}

  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  cancel = () => {
    this.generation += 1;
    this.active = false;
    const current = this.recorder;
    this.recorder = null;
    if (current) {
      current.ondataavailable = null;
      current.onstop = null;
      current.onerror = null;
      try {
        if (current.state !== "inactive") current.stop();
      } catch {
        /* Tracks are released below. */
      }
    }
    this.release();
    if (!this.disposed) {
      this.dependencies.onState("idle");
      this.dependencies.onElapsed(0);
    }
  };

  dispose = () => {
    this.disposed = true;
    this.cancel();
  };

  stop = () => {
    const current = this.recorder;
    if (!current || current.state === "inactive") return;
    this.dependencies.onState("stopping");
    try {
      current.stop();
    } catch {
      this.cancel();
      this.dependencies.onError(
        "The recording could not be stopped cleanly. Please record it again.",
      );
    } finally {
      // Final data events can still arrive after microphone access is released.
      this.release();
    }
  };

  start = async () => {
    if (this.active || this.disposed) return;
    this.active = true;
    const attempt = ++this.generation;
    const valid = () => !this.disposed && attempt === this.generation;
    this.dependencies.onState("requesting");
    this.dependencies.onElapsed(0);
    try {
      const mime = chooseRecordingMime(this.dependencies.supports);
      if (!mime) {
        const error = new Error("Unsupported audio format");
        error.name = "NotSupportedError";
        throw error;
      }
      const input = await this.dependencies.requestStream();
      if (!valid()) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = input;
      const current = this.dependencies.createRecorder(input, mime);
      this.recorder = current;
      const chunks: Blob[] = [];
      let bytes = 0;
      current.ondataavailable = (event) => {
        if (!valid()) return;
        bytes += event.data.size;
        if (bytes > MAX_AUDIO_BYTES) {
          this.cancel();
          this.dependencies.onError(
            "This recording exceeded 20 MB and was discarded. Record a shorter note or upload a smaller file.",
          );
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      current.onerror = () => {
        if (!valid()) return;
        this.cancel();
        this.dependencies.onError(
          "The microphone recording failed. Please rerecord, upload audio, or use written notes.",
        );
      };
      current.onstop = () => {
        if (!valid()) return;
        this.release();
        this.recorder = null;
        this.active = false;
        this.dependencies.onState("idle");
        const type = current.mimeType || chunks[0]?.type || mime;
        const extension = recordingExtension(type);
        const blob = new Blob(chunks, { type });
        if (!extension || !blob.size) {
          this.dependencies.onError(
            "No usable audio was captured. Please rerecord or upload an audio file.",
          );
          return;
        }
        this.dependencies.onRecording(
          new File([blob], `voice-note.${extension}`, { type }),
        );
      };
      current.start(1000);
      const started = Date.now();
      this.timer = setInterval(
        () =>
          this.dependencies.onElapsed(
            Math.floor((Date.now() - started) / 1000),
          ),
        500,
      );
      this.dependencies.onState("recording");
    } catch (error) {
      if (!valid()) return;
      this.cancel();
      this.dependencies.onError(microphoneError(error));
    }
  };
}
