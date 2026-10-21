import { ApiError } from "./auth";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const audioTypes: Record<string, string[]> = {
  mp3: ["audio/mpeg", "audio/mp3"],
  mpeg: ["audio/mpeg", "video/mpeg"],
  mpga: ["audio/mpeg"],
  mp4: ["audio/mp4", "video/mp4"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  webm: ["audio/webm", "video/webm"],
  ogg: ["audio/ogg", "application/ogg"],
  oga: ["audio/ogg", "application/ogg"],
  flac: ["audio/flac", "audio/x-flac"],
};

/** Preserve the negotiated browser container; never relabel Ogg or MP4 bytes as WebM. */
export async function validateAudioUpload(file: File): Promise<File> {
  if (!file.size)
    throw new ApiError(
      400,
      "Choose a recording to transcribe.",
      "audio_required",
    );
  if (file.size > MAX_AUDIO_BYTES)
    throw new ApiError(
      413,
      "Recordings must be 20 MB or smaller.",
      "payload_too_large",
    );
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (!audioTypes[extension]?.includes(mime))
    throw new ApiError(
      415,
      "Choose an MP3, MP4, M4A, WAV, WebM, Ogg or FLAC recording with its original file extension.",
      "invalid_audio_type",
    );
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const signature =
    extension === "wav"
      ? head.toString("ascii", 0, 4) === "RIFF" &&
        head.toString("ascii", 8, 12) === "WAVE"
      : ["mp4", "m4a"].includes(extension)
        ? head.toString("ascii", 4, 8) === "ftyp"
        : extension === "webm"
          ? head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
          : ["ogg", "oga"].includes(extension)
            ? head.toString("ascii", 0, 4) === "OggS"
            : extension === "flac"
              ? head.toString("ascii", 0, 4) === "fLaC"
              : head.toString("ascii", 0, 3) === "ID3" ||
                (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ||
                (head[0] === 0 && head[1] === 0 && head[2] === 1);
  if (!signature)
    throw new ApiError(
      415,
      "This file does not look like a supported recording. Keep the original recording format.",
      "invalid_audio_type",
    );
  // Avoid sending local filenames, which can contain personal information.
  return new File(
    [file],
    `recording.${extension === "oga" ? "ogg" : extension}`,
    { type: mime },
  );
}
