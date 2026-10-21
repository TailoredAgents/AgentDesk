"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { WorkspaceData, Client } from "@/lib/types";
import { Badge, Modal, SectionTitle, shortDate, time } from "../ui";

export function ClientDetail({
  client: c,
  data,
  onClose,
  onProperty,
}: {
  client: Client;
  data: WorkspaceData;
  onClose: () => void;
  onProperty: (id: string) => void;
}) {
  if (!c) return null;
  const messages = data.activities.filter(
    (a) => a.clientId === c.id && a.kind.includes("message"),
  );
  const appts = data.appointments.filter((a) => a.clientId === c.id);
  return (
    <Modal
      title={c.name}
      subtitle={`${c.type} · ${data.agents.find((a) => a.id === c.agentId)?.name}`}
      onClose={onClose}
    >
      <div className="client-detail">
        <div className="contact-details">
          <span>{c.email}</span>
          <span>{c.phone}</span>
        </div>
        {data.properties
          .filter((p) => p.clientId === c.id)
          .map((p) => (
            <button
              className="source-property"
              key={p.id}
              onClick={() => onProperty(p.id)}
            >
              <img src={p.image} alt="" />
              <span>
                <strong>{p.address}</strong>
                <small>{p.city}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
        {appts.map((a) => (
          <div className="client-briefing" key={a.id}>
            <div className="eyebrow">APPOINTMENT BRIEFING</div>
            <h3>{a.title}</h3>
            <p>{a.briefing}</p>
            <small>
              {shortDate(a.startsAt)} · {time(a.startsAt)} · {a.status}
            </small>
          </div>
        ))}
        <SectionTitle title="Relationship notes" />
        {c.notes.length ? (
          c.notes.map((n, i) => (
            <p className="saved-note" key={i}>
              {n}
            </p>
          ))
        ) : (
          <p className="muted">Approved conversation notes will appear here.</p>
        )}
        {messages.length > 0 && (
          <>
            <SectionTitle title="Approved message drafts" />
            {messages.map((m) => (
              <div className="saved-message" key={m.id}>
                <Badge tone="blue">Approved · not sent</Badge>
                <p>{m.detail}</p>
              </div>
            ))}
          </>
        )}
        <div className="info-strip">
          <ShieldCheck size={17} />
          <p>
            Contact details are fictional sample records. Client messages are
            never sent from this release.
          </p>
        </div>
      </div>
    </Modal>
  );
}
