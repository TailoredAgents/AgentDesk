"use client";

import { useState } from "react";
import { ArrowUpRight, Check, ShieldCheck, LoaderCircle } from "lucide-react";
import type { WorkspaceData, Agent } from "@/lib/types";
import { Avatar, Modal, SectionTitle } from "../ui";
import { request } from "./client-api";

export function Settings({
  data,
  agent,
  leader,
  onLeader,
  onClose,
  onUpdate,
  notify,
}: {
  data: WorkspaceData;
  agent: Agent;
  leader: boolean;
  onLeader: (v: boolean) => void;
  onClose: () => void;
  onUpdate: (d: WorkspaceData) => void;
  notify: (m: string) => void;
}) {
  const [style, setStyle] = useState(agent.style),
    [saving, setSaving] = useState(false);
  const save = async () => {
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
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Make it feel like you."
      subtitle="Your voice. Your workspace. Your way of working."
      onClose={onClose}
    >
      <div className="settings-body">
        <div className="settings-profile">
          <Avatar agent={agent} />
          <div>
            <h3>{agent.name}</h3>
            <p>{data.workspace.name} · Sample workspace</p>
          </div>
        </div>
        <SectionTitle title="Communication style" />
        <p className="settings-description">
          Your Relationship Assistant uses these preferences when preparing new
          drafts and refining messages.
        </p>
        <div className="settings-fields">
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
        </div>
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
            onClick={() => onLeader(!leader)}
          >
            <span />
          </button>
        </div>
        <div className="info-strip">
          <ShieldCheck size={17} />
          <p>
            This switch changes presentation only. Production users, brokerage
            permissions, and billing are future work.
          </p>
        </div>
        <div className="modal-footer">
          <a className="text-link" href="/login">
            Access & sign in
            <ArrowUpRight size={13} />
          </a>
          <button className="button primary" onClick={save} disabled={saving}>
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
