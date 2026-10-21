import { ApiError, limitAI, protectedRoute, readBoundedBody } from "@/lib/auth";
import { transcribeAudio } from "@/lib/ai";
import { MAX_AUDIO_BYTES, validateAudioUpload } from "@/lib/audio";
export const runtime = "nodejs";
export const maxDuration = 120;

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
      const bytes = await readBoundedBody(request, MAX_AUDIO_BYTES + 64 * 1024);
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
      return transcribeAudio(await validateAudioUpload(file));
    },
    true,
  );
}
