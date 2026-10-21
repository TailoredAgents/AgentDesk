"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  FileText,
  Mic,
  Upload,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import type { WorkspaceData, Agent } from "@/lib/types";
import { AssistantIcon, Modal, workforce } from "../ui";
import { request } from "./client-api";

export function Capture({
  data,
  agent,
  onClose,
  onComplete,
}: {
  data: WorkspaceData;
  agent: Agent;
  onClose: () => void;
  onComplete: (id: string) => void;
}) {
  const [clientId, setClientId] = useState("sarah"),
    [propertyId, setPropertyId] = useState("willow"),
    [note, setNote] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [mode, setMode] = useState("note"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(""),
    [error, setError] = useState("");
  const client = data.clients.find((c) => c.id === clientId)!;
  const props = data.properties.filter((p) => p.clientId === clientId);
  const example =
    "Spoke with Sarah Mitchell about preparing 1420 Willow Lane for sale. Cleaning is booked for Monday, October 26. Sarah would like photography on Tuesday afternoon, October 27, but the photographer has not confirmed yet. I need to check availability with the photographer, send Sarah a preparation checklist, and follow up with her once we have a confirmed time. She asked whether the patio furniture should stay for the photos; that still needs a decision.";
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      let transcript = note;
      if (mode === "audio") {
        if (!file) throw new Error("Choose an audio recording first.");
        setStep("Transcribing your authorized recording…");
        const form = new FormData();
        form.append("audio", file);
        form.append("authorized", "true");
        const r = await request<{ text: string }>(
          "/api/transcribe",
          "POST",
          form,
        );
        transcript = r.text;
        setNote(transcript);
      }
      setStep("Finding the facts and preparing your next steps…");
      const r = await request<{ packageId: string; workspace?: WorkspaceData }>(
        "/api/conversations",
        "POST",
        {
          agentId: client.agentId,
          clientId,
          propertyId: propertyId || null,
          title: `${client.name.split(" ")[0]} · ${props.find((p) => p.id === propertyId)?.address || "Client conversation"}`,
          transcript,
          authorized: true,
          source: mode === "audio" ? "audio" : "note",
        },
      );
      onComplete(r.packageId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
              <strong>Live AI hasn’t been connected yet.</strong> Add an OpenAI
              API key on the server to process new conversations. The Review
              workspace already contains clearly labeled saved sample work you
              can edit and approve.
            </p>
          </div>
        )}
        <div className="capture-selects">
          <label>
            Client
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPropertyId(
                  data.properties.find((p) => p.clientId === e.target.value)
                    ?.id || "",
                );
              }}
            >
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Related property
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">No linked property</option>
              {props.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="underline-tabs capture-tabs">
          <button
            className={mode === "note" ? "active" : ""}
            onClick={() => setMode("note")}
          >
            <FileText size={15} />
            Written notes
          </button>
          <button
            className={mode === "audio" ? "active" : ""}
            onClick={() => setMode("audio")}
          >
            <Mic size={15} />
            Audio recording
          </button>
        </div>
        {mode === "note" ? (
          <>
            <div className="note-label">
              <label htmlFor="conversation-note">
                What did you talk about?
              </label>
              <button
                className="text-link"
                onClick={() => {
                  setNote(example);
                  setClientId("sarah");
                  setPropertyId("willow");
                }}
              >
                Use sample conversation
                <ArrowDownIcon />
              </button>
            </div>
            <textarea
              id="conversation-note"
              className="capture-textarea"
              placeholder="Just spoke with Sarah about getting the house ready. Cleaning is booked for Monday…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={24000}
            />
            <span className="char-count">
              {note.length.toLocaleString()} / 24,000 characters
            </span>
          </>
        ) : (
          <label className="audio-upload">
            <span className="upload-icon">
              <Upload size={26} />
            </span>
            <strong>
              {file ? file.name : "Choose an authorized recording"}
            </strong>
            <span>MP3, M4A, WAV, MP4, or WebM · up to 20 MB</span>
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,.m4a"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError("");
              }}
            />
            <small>
              Audio is transcribed in memory and is not kept on disk.
            </small>
          </label>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          <span>
            I’m authorized to share these notes or this recording with OpenAI
            for processing and have the required consent. The transcript and
            prepared work will be saved in AgentDesk.
          </span>
        </label>
        <div className="pipeline-preview">
          {[1, 2, 3].map((i) => (
            <span key={i}>
              <AssistantIcon index={i} small />
              {workforce[i].short}
              {i < 3 && <ChevronRight size={13} />}
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
              busy ||
              !authorized ||
              (mode === "note" ? note.trim().length < 30 : !file)
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

function ArrowDownIcon() {
  return <ArrowRight size={12} style={{ transform: "rotate(45deg)" }} />;
}
