export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// Choose a supported container rather than relabelling a browser's audio bytes.
export function chooseRecordingMime(
  isSupported: (mime: string) => boolean,
): string | null {
  return (
    [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "audio/ogg",
    ].find(isSupported) ?? null
  );
}

export function recordingExtension(
  mime: string,
): "webm" | "mp4" | "ogg" | null {
  switch (mime.toLowerCase().split(";")[0].trim()) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "mp4";
    case "audio/ogg":
      return "ogg";
    default:
      return null;
  }
}

export function microphoneError(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone permission was denied. Allow microphone access in your browser’s site settings, or upload audio or use written notes.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No microphone was found. Connect a microphone and try again, or upload audio or use written notes.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "The microphone could not be opened. Check whether another application is using it, then try again.";
  if (name === "NotSupportedError")
    return "This browser cannot record a supported audio format. Upload audio or use written notes instead.";
  return "The recording could not be completed. Try again, upload audio, or use written notes.";
}

export function elapsedLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
