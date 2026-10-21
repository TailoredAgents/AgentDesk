"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  FileText,
  Mic,
  Square,
  RotateCcw,
  Trash2,
  Upload,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import type { WorkspaceData, Agent } from "@/lib/types";
import { AssistantIcon, Modal, workforce } from "../ui";
import { request } from "./client-api";
import { elapsedLabel, MAX_AUDIO_BYTES } from "./recording-helpers";
import { useVoiceRecorder } from "./use-voice-recorder";

export function Capture({
  data,
  agent,
  onClose,
  onComplete,
}: {
  data: WorkspaceData;
  agent: Agent;
  onClose: () => void;
  onComplete: (id: string, workspace?: WorkspaceData) => void | Promise<void>;
}) {
  const clients = data.clients.filter((client) => client.agentId === agent.id);
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [propertyId, setPropertyId] = useState(
    data.properties.find(
      (p) => p.clientId === clients[0]?.id && p.agentId === agent.id,
    )?.id || "",
  );
  const [note, setNote] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [mode, setMode] = useState<"note" | "audio">("note");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState(false);
  const requestId = useRef<string | null>(null);
  const audioTranscript = useRef<string | null>(null);
  const submitting = useRef(false);
  const client = clients.find((c) => c.id === clientId);
  const properties = data.properties.filter(
    (p) => p.clientId === clientId && p.agentId === agent.id,
  );
  const fixture = data.workspace.sample
    ? data.conversations.find(
        (c) =>
          c.agentId === agent.id &&
          c.clientId === clientId &&
          c.propertyId === (propertyId || null) &&
          c.source === "sample",
      )
    : undefined;
  const changed = () => {
    requestId.current = null;
    setError("");
  };
  const chooseFile = (next: File | null) => {
    changed();
    audioTranscript.current = null;
    if (next && (!next.size || next.size > MAX_AUDIO_BYTES)) {
      setFile(null);
      setError(
        next.size
          ? "Choose an audio file smaller than 20 MB."
          : "The audio file is empty. Choose another recording.",
      );
      return;
    }
    setFile(next);
  };
  const recorder = useVoiceRecorder(chooseFile, setError);
  const recording = recorder.state !== "idle";
  const locked = busy || recording;

  useEffect(() => {
    setPlaybackError(false);
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const startRecording = () => {
    if (!authorized || busy) return;
    chooseFile(null);
    void recorder.start();
  };
  const submit = async () => {
    if (
      submitting.current ||
      recording ||
      !authorized ||
      !client ||
      !data.capabilities.ai ||
      (mode === "audio" && !data.capabilities.transcription)
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      let transcript = note;
      if (mode === "audio") {
        if (!file) throw new Error("Choose or record authorized audio first.");
        if (audioTranscript.current === null) {
          setStep("Transcribing your authorized recording…");
          const form = new FormData();
          form.append("audio", file);
          form.append("authorized", "true");
          const result = await request<{ text: string }>(
            "/api/transcribe",
            "POST",
            form,
          );
          audioTranscript.current = result.text;
        }
        transcript = audioTranscript.current;
      }
      setStep("Finding the facts and preparing your next steps…");
      const result = await request<{
        packageId: string;
        workspace?: WorkspaceData;
      }>("/api/conversations", "POST", {
        requestId: requestId.current,
        agentId: agent.id,
        clientId,
        propertyId: propertyId || null,
        title: `${client.name.split(" ")[0]} · ${properties.find((p) => p.id === propertyId)?.address || "Client conversation"}`,
        transcript,
        authorized: true,
        source: mode === "audio" ? "audio" : "note",
      });
      await onComplete(result.packageId, result.workspace);
    } catch (error) {
      setError(
        (error as Error).message ||
          "The conversation could not be prepared. Your inputs are still here so you can retry.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="A conversation. A clearer next step."
      subtitle="Share the context. Your workforce will take it from here."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="capture-body">
        {!data.capabilities.ai && (
          <div className="info-strip">
            <AlertCircle size={18} />
            <p>
              <strong>Live AI hasn’t been connected yet.</strong> You can write
              notes and record or preview audio locally. A server OpenAI API key
              is required to transcribe and prepare new work. Clearly labeled
              saved sample work is available in Review.
            </p>
          </div>
        )}
        <div className="capture-selects">
          <label>
            Client · {agent.name}
            <select
              value={clientId}
              disabled={locked}
              onChange={(event) => {
                changed();
                setClientId(event.target.value);
                setPropertyId(
                  data.properties.find(
                    (p) =>
                      p.clientId === event.target.value &&
                      p.agentId === agent.id,
                  )?.id || "",
                );
              }}
            >
              {!clients.length && <option value="">No clients assigned</option>}
              {clients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Related property
            <select
              value={propertyId}
              disabled={locked}
              onChange={(event) => {
                changed();
                setPropertyId(event.target.value);
              }}
            >
              <option value="">No linked property</option>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.address}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="underline-tabs capture-tabs">
          <button
            disabled={locked}
            className={mode === "note" ? "active" : ""}
            onClick={() => {
              if (mode !== "note") changed();
              setMode("note");
            }}
          >
            <FileText size={15} />
            Written notes
          </button>
          <button
            disabled={locked}
            className={mode === "audio" ? "active" : ""}
            onClick={() => {
              if (mode !== "audio") changed();
              setMode("audio");
            }}
          >
            <Mic size={15} />
            Audio recording
          </button>
        </div>
        <label className="consent">
          <input
            type="checkbox"
            checked={authorized}
            disabled={locked}
            onChange={(event) => setAuthorized(event.target.checked)}
          />
          <span>
            I have the required consent to record and am authorized to share
            these notes or this recording with OpenAI when I select Prepare my
            work. The transcript and prepared work will be saved in AgentDesk.
            Audio is not saved on the server.
          </span>
        </label>
        {mode === "note" ? (
          <>
            <div className="note-label">
              <label htmlFor="conversation-note">
                What did you talk about?
              </label>
              {fixture && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    changed();
                    setNote(fixture.transcript);
                  }}
                >
                  Use saved fictional {client?.name.split(" ")[0]} example
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
            <textarea
              id="conversation-note"
              className="capture-textarea"
              placeholder="Describe the conversation, what is confirmed, what is still uncertain, and any next steps…"
              value={note}
              disabled={busy}
              onChange={(event) => {
                changed();
                setNote(event.target.value);
              }}
              maxLength={24000}
            />
            <span className="char-count">
              {note.length.toLocaleString()} / 24,000 characters
            </span>
          </>
        ) : (
          <>
            <div className="voice-recorder">
              <div className="recorder-heading">
                <Mic size={19} />
                <div>
                  <strong>Record a voice note</strong>
                  <p>Review the audio before sharing it for transcription.</p>
                </div>
              </div>
              {recorder.supported === false && (
                <p className="recording-help" role="status">
                  Microphone recording isn’t supported here. Use HTTPS or
                  localhost in a compatible browser, or use the upload and
                  written-note alternatives.
                </p>
              )}
              <div className="recorder-actions">
                {recorder.state === "recording" ? (
                  <>
                    <span className="recording-status" role="status">
                      <span />
                      Recording <time>{elapsedLabel(recorder.elapsed)}</time>
                    </span>
                    <button
                      className="button secondary"
                      onClick={recorder.stop}
                    >
                      <Square size={14} />
                      Stop recording
                    </button>
                  </>
                ) : recorder.state === "requesting" ? (
                  <>
                    <span role="status">
                      Waiting for microphone permission…
                    </span>
                    <button className="text-link" onClick={recorder.cancel}>
                      Cancel
                    </button>
                  </>
                ) : recorder.state === "stopping" ? (
                  <span role="status">
                    <LoaderCircle size={15} className="spin" />
                    Preparing playback…
                  </span>
                ) : (
                  <button
                    className="button secondary"
                    disabled={!authorized || busy || !recorder.supported}
                    onClick={startRecording}
                  >
                    {file ? <RotateCcw size={15} /> : <Mic size={15} />}
                    {file ? "Rerecord" : "Record voice note"}
                  </button>
                )}
                {!authorized && (
                  <small>Confirm consent above to enable the microphone.</small>
                )}
              </div>
              {preview && !recording && (
                <div className="audio-preview">
                  <strong>{file?.name}</strong>
                  <audio
                    controls
                    src={preview}
                    preload="metadata"
                    aria-label="Recording playback"
                    onError={() => setPlaybackError(true)}
                  />
                  {playbackError && (
                    <p role="alert">
                      This browser could not play this file. Choose a format you
                      can preview before submitting.
                    </p>
                  )}
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => chooseFile(null)}
                  >
                    <Trash2 size={13} />
                    Discard recording
                  </button>
                </div>
              )}
            </div>
            <label
              className={`audio-upload compact-upload ${locked ? "disabled-upload" : ""}`}
            >
              <Upload size={22} />
              <strong>Or upload an authorized recording</strong>
              <span>MP3, M4A, WAV, MP4, WebM, or OGG · up to 20 MB</span>
              <input
                type="file"
                aria-label="Upload an authorized recording"
                disabled={locked}
                accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,audio/ogg,video/mp4,.m4a,.mp3,.mpga,.mpeg,.wav,.webm,.ogg"
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) chooseFile(next);
                  event.target.value = "";
                }}
              />
              <small>
                Audio stays in this browser until you select Prepare my work.
              </small>
            </label>
            {data.capabilities.ai && !data.capabilities.transcription && (
              <p className="recording-help">
                Transcription is unavailable. You can keep working with written
                notes.
              </p>
            )}
          </>
        )}
        <div className="pipeline-preview">
          {[1, 2, 3].map((index) => (
            <span key={index}>
              <AssistantIcon index={index} small />
              {workforce[index].short}
              {index < 3 && <ChevronRight size={13} />}
            </span>
          ))}
        </div>
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}
        {busy && (
          <div className="processing-state" role="status">
            <LoaderCircle className="spin" size={19} />
            {step}
          </div>
        )}
        <div className="modal-footer">
          <span>
            <ShieldCheck size={15} />
            You review every action before it’s applied.
          </span>
          <button
            className="button primary"
            disabled={
              !data.capabilities.ai ||
              locked ||
              !authorized ||
              !client ||
              (mode === "note"
                ? note.trim().length < 30
                : !file || !data.capabilities.transcription || playbackError)
            }
            onClick={submit}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}
            Prepare my work
          </button>
        </div>
      </div>
    </Modal>
  );
}
