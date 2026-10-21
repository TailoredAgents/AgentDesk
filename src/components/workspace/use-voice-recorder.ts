"use client";

import { useEffect, useRef, useState } from "react";
import { chooseRecordingMime } from "./recording-helpers";
import {
  VoiceRecorderController,
  type RecordingState,
} from "./voice-recorder-controller";

export function useVoiceRecorder(
  onRecording: (file: File) => void,
  onError: (message: string) => void,
) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState<boolean | null>(null);
  const controller = useRef<VoiceRecorderController | null>(null);
  const callbacks = useRef({ onRecording, onError });
  callbacks.current = { onRecording, onError };

  useEffect(() => {
    let canRecord = false;
    try {
      canRecord =
        window.isSecureContext &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function" &&
        !!chooseRecordingMime((mime) => MediaRecorder.isTypeSupported(mime));
    } catch {
      /* Upload and written notes remain available. */
    }
    setSupported(canRecord);
    if (!canRecord) return;
    const recorder = new VoiceRecorderController({
      requestStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      createRecorder: (stream, mimeType) =>
        new MediaRecorder(stream, { mimeType }),
      supports: (mime) => MediaRecorder.isTypeSupported(mime),
      onState: setState,
      onElapsed: setElapsed,
      onRecording: (file) => callbacks.current.onRecording(file),
      onError: (message) => callbacks.current.onError(message),
    });
    controller.current = recorder;
    return () => {
      recorder.dispose();
      controller.current = null;
    };
  }, []);

  return {
    state,
    elapsed,
    supported,
    start: () => controller.current?.start(),
    stop: () => controller.current?.stop(),
    cancel: () => controller.current?.cancel(),
  };
}
