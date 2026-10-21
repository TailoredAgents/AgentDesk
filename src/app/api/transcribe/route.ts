import { ApiError, limitAI, protectedRoute, readBoundedBody } from "@/lib/auth";
import { transcribeAudio } from "@/lib/ai";
export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_AUDIO = 20 * 1024 * 1024;
const audioTypes: Record<string, string[]> = {
  mp3: ["audio/mpeg", "audio/mp3"],
  mpeg: ["audio/mpeg", "video/mpeg"],
  mpga: ["audio/mpeg"],
  mp4: ["audio/mp4", "video/mp4"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  webm: ["audio/webm", "video/webm"],
};

export async function POST(request: Request) {
  return protectedRoute(
    request,
    async () => {
      if (
        !request.headers.get("content-type")?.startsWith("multipart/form-data;")
      )
        throw new ApiError(
          415,
          "Upload an audio file using the recording form.",
          "invalid_content_type",
        );
      limitAI();
      // Bound even chunked uploads before multipart parsing; all bytes stay in memory.
      const bytes = await readBoundedBody(request, MAX_AUDIO + 64 * 1024);
      const bounded = new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type")! },
        body: new Uint8Array(bytes),
      });
      let form: FormData;
      try {
        form = await bounded.formData();
      } catch {
        throw new ApiError(
          400,
          "The audio upload could not be read.",
          "invalid_upload",
        );
      }
      if (form.get("authorized") !== "true")
        throw new ApiError(
          400,
          "Confirm you have permission to upload and process this recording.",
          "consent_required",
        );
      const file = form.get("audio");
      if (!(file instanceof File) || !file.size)
        throw new ApiError(
          400,
          "Choose a recording to transcribe.",
          "audio_required",
        );
      if (file.size > MAX_AUDIO)
        throw new ApiError(
          413,
          "Recordings must be 20 MB or smaller.",
          "payload_too_large",
        );
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = file.type.split(";")[0].toLowerCase();
      if (!audioTypes[extension]?.includes(mime))
        throw new ApiError(
          415,
          "Choose an MP3, MP4, M4A, WAV, MPEG or WebM recording.",
          "invalid_audio_type",
        );
      const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
      const validSignature =
        extension === "wav"
          ? head.toString("ascii", 0, 4) === "RIFF" &&
            head.toString("ascii", 8, 12) === "WAVE"
          : ["mp4", "m4a"].includes(extension)
            ? head.toString("ascii", 4, 8) === "ftyp"
            : extension === "webm"
              ? head
                  .subarray(0, 4)
                  .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
              : head.toString("ascii", 0, 3) === "ID3" ||
                (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ||
                (head[0] === 0 && head[1] === 0 && head[2] === 1);
      if (!validSignature)
        throw new ApiError(
          415,
          "This file does not look like a supported recording.",
          "invalid_audio_type",
        );
      // Pass a neutral filename: local filenames can contain unnecessary personal information.
      return transcribeAudio(
        new File([file], `recording.${extension}`, { type: mime }),
      );
    },
    true,
  );
}
