"use client";

import type { FollowUpRecommendation, WorkspaceData } from "@/lib/types";
import { Badge, Modal, SectionTitle, shortDate, TextLink } from "../ui";

export function FollowUp({
  item,
  data,
  busy,
  onClose,
  onReview,
  onPrepare,
  onClient,
  onProperty,
}: {
  item: FollowUpRecommendation;
  data: WorkspaceData;
  busy: boolean;
  onClose: () => void;
  onReview: (id: string) => void;
  onPrepare: () => void;
  onClient: (id: string) => void;
  onProperty: (id: string) => void;
}) {
  const client = data.clients.find((value) => value.id === item.clientId)!;
  const pkg = data.packages.find((value) => value.id === item.packageId);
  const property = data.properties.find(
    (value) => value.id === item.propertyId,
  );
  return (
    <Modal
      title={`${client.name} — ${item.title}`}
      subtitle="Relationship Assistant · grounded in your saved workspace"
      onClose={onClose}
    >
      <div className="client-detail">
        <Badge tone={item.urgency === "overdue" ? "amber" : "blue"}>
          {item.urgency}
          {item.dueDate
            ? ` · ${shortDate(item.dueDate)}`
            : " · no confirmed deadline"}
        </Badge>
        <div className="client-briefing">
          <h3>Why this needs attention</h3>
          <p>{item.reason}</p>
          <small>
            Based on {shortDate(data.workspace.referenceDate)} in this fictional
            workspace.
          </small>
        </div>
        <SectionTitle title="The evidence behind the recommendation" />
        {item.evidence.map((evidence, index) => (
          <p className="saved-note" key={index}>
            {evidence}
          </p>
        ))}
        {item.uncertainties.length > 0 && (
          <div className="clarifications">
            <h3>Still to confirm</h3>
            <ul>
              {item.uncertainties.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        )}
        <SectionTitle title="Context that shapes the message" />
        <p className="saved-note">
          {client.notes.length
            ? client.notes.join(" ")
            : "No additional client preferences are recorded."}
        </p>
        <TextLink onClick={() => onClient(client.id)}>
          Open client record & commitments
        </TextLink>
        {property && (
          <TextLink onClick={() => onProperty(property.id)}>
            Open {property.address}
          </TextLink>
        )}
        {pkg ? (
          <div className="client-briefing">
            <Badge tone={pkg.origin === "sample" ? "neutral" : "blue"}>
              {pkg.origin === "sample"
                ? "Saved sample output"
                : "AI-prepared draft"}
            </Badge>
            <h3>{pkg.title}</h3>
            <p>
              {pkg.actions.find((action) => action.kind === "message")?.body ||
                pkg.summary}
            </p>
            <button className="button primary" onClick={() => onReview(pkg.id)}>
              {pkg.status === "pending"
                ? "Review prepared work"
                : "View review history"}
            </button>
          </div>
        ) : (
          <div className="client-briefing">
            <h3>Context ready for a personalized draft</h3>
            <p>
              {data.capabilities.ai
                ? "Prepare a proposal using these records and this agent’s communication style."
                : "Live AI is not configured. Other saved sample packages remain available in Review; this recommendation has no saved draft."}
            </p>
            <button
              className="button primary"
              onClick={onPrepare}
              disabled={busy || !data.capabilities.ai}
            >
              {busy ? "Preparing…" : "Prepare follow-up for review"}
            </button>
          </div>
        )}
        <div className="info-strip">
          <p>
            Approving a message saves a draft. It does not send it, complete a
            task, or resolve a client question. Record completion only when the
            work actually happens.
          </p>
        </div>
      </div>
    </Modal>
  );
}
