"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { WorkspaceData, Client, Commitment, Task } from "@/lib/types";
import { Badge, Modal, SectionTitle, shortDate, time } from "../ui";
import { CommitmentList } from "./commitments";
import { TaskRow } from "./shared";
import { orderedTasks } from "@/lib/workspace-insights";
import { currentContextText, situationImpacts } from "@/lib/intelligence";
import { ClientIntelligence } from "./intelligence";
import { WorkProducts } from "./work-products";
import { MessageActions } from "./message-actions";
import { AppointmentCalendar } from "./calendar-actions";

export function ClientDetail({
  client: c,
  data,
  onClose,
  onProperty,
  onCommitment,
  onTask,
  onReview,
  onUpdate,
  notify,
}: {
  client: Client;
  data: WorkspaceData;
  onClose: () => void;
  onProperty: (id: string) => void;
  onCommitment: (item: Commitment) => void;
  onTask: (item: Task) => void;
  onReview: (id: string) => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string) => void;
}) {
  if (!c) return null;
  const memory = (data.clientFacts ?? []).filter(
    (f) => f.agentId === c.agentId && f.clientId === c.id,
  );
  const impacts = situationImpacts(data).filter((i) => i.clientId === c.id);
  const messages = data.packages
    .filter((pkg) => pkg.clientId === c.id)
    .flatMap((pkg) =>
      pkg.actions.filter(
        (action) => action.kind === "message" && action.status === "approved",
      ),
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
        <ClientIntelligence
          data={data}
          client={c}
          onUpdate={onUpdate}
          onReview={onReview}
          notify={notify}
        />
        {appts.map((a) => (
          <div className="client-briefing" key={a.id}>
            <div className="eyebrow">APPOINTMENT BRIEFING</div>
            <h3>{a.title}</h3>
            {impacts.some(
              (i) => i.kind === "appointment" && i.targetId === a.id,
            ) && (
              <Badge tone="amber">Briefing needs review after a change</Badge>
            )}
            <p>{a.briefing}</p>
            <small>
              {shortDate(a.startsAt)} · {time(a.startsAt)} · {a.status}
            </small>
            <AppointmentCalendar appointment={a} />
            <WorkProducts
              data={data}
              onUpdate={onUpdate}
              notify={notify}
              filter={{ appointmentId: a.id }}
              context={{
                kind: "appointment_briefing",
                agentId: a.agentId,
                clientId: a.clientId,
                propertyId: a.propertyId,
                appointmentId: a.id,
              }}
              title="Prepared briefing"
            />
          </div>
        ))}
        <WorkProducts
          data={data}
          onUpdate={onUpdate}
          notify={notify}
          filter={{ clientId: c.id }}
          title="Client work products"
        />
        {commitments.length > 0 && (
          <>
            <SectionTitle title="Commitments & unanswered questions" />
            <CommitmentList
              items={commitments}
              onChange={onCommitment}
              outdatedIds={impacts
                .filter((i) => i.kind === "commitment")
                .map((i) => i.targetId)}
            />
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
                onUpdate={onUpdate}
                notify={notify}
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
                    {pkg.origin === "sample"
                      ? "Saved sample output"
                      : pkg.origin === "human"
                        ? "Human correction"
                        : "OpenAI"}{" "}
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
        <SectionTitle title="Recorded relationship notes" />
        {c.notes.length ? (
          c.notes.map((n, i) => (
            <p className="saved-note" key={i}>
              {currentContextText(n, memory) !== n && (
                <Badge tone="amber">
                  Includes earlier information · see current situation above
                </Badge>
              )}
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
                {impacts.some(
                  (i) => i.kind === "message" && i.targetId === m.id,
                ) && (
                  <p className="intelligence-warning">
                    Earlier plan · review the updated draft before use.
                  </p>
                )}
                <p>{m.body}</p>
                <MessageActions body={m.body} notify={notify} />
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
