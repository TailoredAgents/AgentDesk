"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { WorkspaceData, Client, Commitment, Task } from "@/lib/types";
import { Badge, Modal, SectionTitle, shortDate, time } from "../ui";
import { CommitmentList } from "./commitments";
import { TaskRow } from "./shared";
import { orderedTasks } from "@/lib/workspace-insights";

export function ClientDetail({
  client: c,
  data,
  onClose,
  onProperty,
  onCommitment,
  onTask,
  onReview,
}: {
  client: Client;
  data: WorkspaceData;
  onClose: () => void;
  onProperty: (id: string) => void;
  onCommitment: (item: Commitment) => void;
  onTask: (item: Task) => void;
  onReview: (id: string) => void;
}) {
  if (!c) return null;
  const messages = data.activities.filter(
    (a) => a.clientId === c.id && a.kind.includes("message"),
  );
  const appts = data.appointments.filter((a) => a.clientId === c.id);
  const commitments = data.commitments.filter((item) => item.clientId === c.id);
  const tasks = orderedTasks(
    data.tasks.filter((item) => item.clientId === c.id),
    data.workspace.referenceDate,
  );
  const packages = data.packages.filter((item) => item.clientId === c.id);
  const conversations = data.conversations.filter(
    (item) => item.clientId === c.id,
  );
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
        {commitments.length > 0 && (
          <>
            <SectionTitle title="Commitments & unanswered questions" />
            <CommitmentList items={commitments} onChange={onCommitment} />
          </>
        )}
        {tasks.length > 0 && (
          <>
            <SectionTitle title="Recorded next steps" />
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                data={data}
                onToggle={() => onTask(task)}
                onProperty={onProperty}
              />
            ))}
          </>
        )}
        {packages.length > 0 && (
          <>
            <SectionTitle title="Conversations & review history" />
            {packages.map((pkg) => (
              <button
                className="detail-conversation"
                key={pkg.id}
                onClick={() => onReview(pkg.id)}
              >
                <div>
                  <strong>{pkg.title}</strong>
                  <small>
                    {pkg.origin === "sample" ? "Saved sample output" : "OpenAI"}{" "}
                    · {shortDate(pkg.createdAt)}
                  </small>
                </div>
                <Badge tone={pkg.status === "pending" ? "blue" : "green"}>
                  {pkg.status === "pending" ? "Decisions pending" : "Reviewed"}
                </Badge>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </>
        )}
        {conversations.length > 0 && (
          <>
            <SectionTitle title="Source history" />
            {conversations.map((conversation) => (
              <details className="source-evidence" key={conversation.id}>
                <summary>
                  {conversation.title} · {shortDate(conversation.createdAt)}
                </summary>
                <small>
                  {conversation.source === "followup"
                    ? "Workspace evidence snapshot"
                    : conversation.source === "sample"
                      ? "Saved fictional conversation"
                      : "Authorized conversation source"}
                </small>
                <p>{conversation.transcript}</p>
              </details>
            ))}
          </>
        )}
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
