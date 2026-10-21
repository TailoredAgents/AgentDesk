"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ShieldCheck,
  LoaderCircle,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import type { WorkspaceData, Agent } from "@/lib/types";
import { Avatar, Modal, SectionTitle } from "../ui";
import { request } from "./client-api";

export function Settings({
  data,
  agent,
  leader,
  onLeader,
  onAgentChange,
  onClose,
  onUpdate,
  notify,
}: {
  data: WorkspaceData;
  agent: Agent;
  leader: boolean;
  onLeader: (v: boolean) => void;
  onAgentChange: (id: string) => void;
  onClose: () => void;
  onUpdate: (d: WorkspaceData) => void;
  notify: (m: string) => void;
}) {
  const [style, setStyle] = useState(agent.style),
    [saving, setSaving] = useState(false),
    [resetting, setResetting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const mutating = useRef(false);
  const locked = saving || resetting;
  const save = async () => {
    if (mutating.current) return;
    mutating.current = true;
    setSaving(true);
    try {
      onUpdate(
        await request<WorkspaceData>(
          `/api/agents/${agent.id}/style`,
          "PATCH",
          style,
        ),
      );
      notify("Your communication preferences are saved.");
      onClose();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      mutating.current = false;
      setSaving(false);
    }
  };
  const reset = async () => {
    if (
      !data.workspace.sample ||
      confirmation !== "RESTORE FICTIONAL WORKSPACE" ||
      mutating.current
    )
      return;
    mutating.current = true;
    setResetting(true);
    try {
      onUpdate(
        await request<WorkspaceData>("/api/demo/reset", "POST", {
          confirmation,
        }),
      );
      notify(
        "The fictional workspace has been restored. Added conversations, decisions, and preference changes were removed.",
      );
      onClose();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      mutating.current = false;
      setResetting(false);
    }
  };
  return (
    <Modal
      title="Make it feel like you."
      subtitle="Your voice. Your workspace. Your way of working."
      onClose={() => {
        if (!locked) onClose();
      }}
    >
      <div className="settings-body">
        <div className="settings-profile">
          <Avatar agent={agent} />
          <div>
            <h3>{agent.name}</h3>
            <p>
              {data.workspace.name}
              {data.workspace.sample
                ? " · Sample workspace"
                : " · Shared workspace"}
            </p>
          </div>
        </div>
        <div className="settings-fields agent-preview-field">
          <label>
            Agent preview · shared workspace
            <select
              value={agent.id}
              disabled={locked}
              onChange={(event) => onAgentChange(event.target.value)}
            >
              {data.agents.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-description">
          Preview a human agent’s assigned work and communication style. This is
          not access control. Save style changes before switching agents.
        </p>
        <SectionTitle title="Communication style" />
        <p className="settings-description">
          Your Relationship Assistant uses these preferences when preparing new
          drafts and refining messages.
        </p>
        <fieldset
          className="settings-fields style-preferences"
          disabled={locked}
        >
          <label>
            Preferred tone
            <select
              value={style.tone}
              onChange={(e) => setStyle({ ...style, tone: e.target.value })}
            >
              {[
                ...new Set([
                  style.tone,
                  "Warm and conversational",
                  "Polished and professional",
                  "Friendly and direct",
                ]),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Message length
            <select
              value={style.length}
              onChange={(e) => setStyle({ ...style, length: e.target.value })}
            >
              {[
                ...new Set([
                  style.length,
                  "Short and to the point",
                  "A little more detail",
                ]),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Directness
            <textarea
              value={style.directness || ""}
              maxLength={500}
              rows={2}
              placeholder="For example: lead with the next step; be clear without pressure."
              onChange={(event) =>
                setStyle({ ...style, directness: event.target.value })
              }
            />
          </label>
          <label>
            Greeting style
            <textarea
              value={style.greeting || ""}
              maxLength={500}
              rows={2}
              placeholder="For example: Hi [first name], or no greeting in a short text."
              onChange={(event) =>
                setStyle({ ...style, greeting: event.target.value })
              }
            />
          </label>
          <label>
            Sign-off style
            <textarea
              value={style.signoff || ""}
              maxLength={500}
              rows={2}
              placeholder="For example: Thanks, followed by my first name."
              onChange={(event) =>
                setStyle({ ...style, signoff: event.target.value })
              }
            />
          </label>
          <label>
            Preferred wording
            <textarea
              value={style.preferredWords || ""}
              maxLength={500}
              rows={2}
              placeholder="Words and phrases that sound natural to you."
              onChange={(event) =>
                setStyle({ ...style, preferredWords: event.target.value })
              }
            />
          </label>
          <label>
            Words or phrases to avoid
            <textarea
              value={style.avoid}
              maxLength={1500}
              rows={2}
              onChange={(e) => setStyle({ ...style, avoid: e.target.value })}
            />
          </label>
          <label>
            An approved example in your voice
            <textarea
              value={style.examples}
              maxLength={4000}
              rows={4}
              onChange={(e) => setStyle({ ...style, examples: e.target.value })}
            />
          </label>
        </fieldset>
        <div className="role-preview">
          <div>
            <h3>Team leader presentation</h3>
            <p>A display preference for the shared sample workspace.</p>
          </div>
          <button
            role="switch"
            aria-checked={leader}
            aria-label="Team leader presentation"
            className={`toggle ${leader ? "on" : ""}`}
            disabled={locked}
            onClick={() => onLeader(!leader)}
          >
            <span />
          </button>
        </div>
        <div className="info-strip">
          <ShieldCheck size={17} />
          <p>
            These preview controls change presentation only. Everyone with this
            shared workspace password has the same access.
          </p>
        </div>
        {data.workspace.sample && (
          <details className="sample-reset">
            <summary>
              <RotateCcw size={14} /> Restore the fictional presentation
              workspace
            </summary>
            <div className="info-strip">
              <AlertCircle size={17} />
              <p>
                This permanently removes added conversations, review decisions,
                tasks, history, and style changes in this fictional workspace,
                then restores the original six-agent sample. Other workspaces
                and external systems are not touched. Do not store real customer
                data here.
              </p>
            </div>
            <label>
              Type <strong>RESTORE FICTIONAL WORKSPACE</strong> to confirm
              <input
                value={confirmation}
                disabled={locked}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={
                locked || confirmation !== "RESTORE FICTIONAL WORKSPACE"
              }
              onClick={reset}
            >
              {resetting ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              Restore fictional workspace
            </button>
          </details>
        )}
        <div className="modal-footer">
          <a className="text-link" href="/login">
            Access & sign in
            <ArrowUpRight size={13} />
          </a>
          <button className="button primary" onClick={save} disabled={locked}>
            {saving ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Save preferences
          </button>
        </div>
      </div>
    </Modal>
  );
}
