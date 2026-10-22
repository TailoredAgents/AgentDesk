"use client";

import { ArrowUpRight, ChevronRight, Check } from "lucide-react";
import type { WorkspaceData, Property, Task, Commitment } from "@/lib/types";
import {
  AssistantIcon,
  Avatar,
  Badge,
  Modal,
  SectionTitle,
  money,
  shortDate,
} from "../ui";
import { Progress, TaskRow } from "./shared";
import { CommitmentList } from "./commitments";
import { listingMilestones, orderedTasks } from "@/lib/workspace-insights";
import { WorkProducts } from "./work-products";

export function PropertyDetail({
  property: p,
  data,
  onClose,
  onTask,
  onReview,
  onClient,
  onCommitment,
  onUpdate,
  notify,
}: {
  property: Property;
  data: WorkspaceData;
  onClose: () => void;
  onTask: (t: Task) => void;
  onReview: (id: string) => void;
  onClient: (id: string) => void;
  onCommitment: (item: Commitment) => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string) => void;
}) {
  if (!p) return null;
  const tasks = orderedTasks(
    data.tasks.filter((t) => t.propertyId === p.id),
    data.workspace.referenceDate,
  );
  const commitments = data.commitments.filter(
    (item) => item.propertyId === p.id,
  );
  const client = data.clients.find((c) => c.id === p.clientId)!;
  const agent = data.agents.find((a) => a.id === p.agentId)!;
  const packages = data.packages.filter((x) => x.propertyId === p.id);
  return (
    <Modal title={p.address} subtitle={p.city} onClose={onClose} wide>
      <div className="property-detail-image">
        <img src={p.image} alt={p.description} />
        <Badge tone="white">{p.stage}</Badge>
        <span>{money(p.price)}</span>
      </div>
      <div className="property-detail-body">
        <div className="property-detail-overview">
          <div>
            <div className="property-specs">
              <span>{p.beds} bedrooms</span>
              <span>{p.baths} bathrooms</span>
              <span>{p.sqft.toLocaleString()} sq ft</span>
            </div>
            <p>{p.description}</p>
          </div>
          <button className="client-chip" onClick={() => onClient(client.id)}>
            <span className="client-initial">
              {client.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <span>
              <strong>{client.name}</strong>
              <small>Seller · View client</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="milestone-track">
          {listingMilestones(p, tasks).map((milestone, index) => (
            <div
              key={milestone.title}
              className={milestone.complete ? "complete" : "current"}
            >
              <span>
                {milestone.complete ? <Check size={12} /> : index + 1}
              </span>
              <strong>{milestone.title}</strong>
              <small>{milestone.detail}</small>
            </div>
          ))}
        </div>
        <WorkProducts
          data={data}
          onUpdate={onUpdate}
          notify={notify}
          filter={{ propertyId: p.id }}
          context={{
            kind: "seller_preparation",
            agentId: p.agentId,
            clientId: p.clientId,
            propertyId: p.id,
          }}
          title="Prepared for this listing"
        />
        {commitments.length > 0 && (
          <>
            <SectionTitle title="Dependencies & commitments" />
            <CommitmentList items={commitments} onChange={onCommitment} />
          </>
        )}
        <SectionTitle
          title="Every detail, accounted for"
          aside={
            <span className="small-text muted">
              {tasks.filter((t) => t.status === "done").length} of{" "}
              {tasks.length} complete
            </span>
          }
        />
        <Progress
          done={tasks.filter((t) => t.status === "done").length}
          total={tasks.length}
        />
        <div className="detail-task-list">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              data={data}
              onToggle={() => onTask(t)}
              onUpdate={onUpdate}
              notify={notify}
            />
          ))}
        </div>
        {packages.length > 0 && (
          <>
            <SectionTitle title="Conversations & prepared work" />
            {packages.map((pkg) => (
              <button
                className="detail-conversation"
                key={pkg.id}
                onClick={() => onReview(pkg.id)}
              >
                <AssistantIcon index={1} small />
                <div>
                  <strong>{pkg.title}</strong>
                  <small>
                    {shortDate(pkg.createdAt)} ·{" "}
                    {pkg.origin === "sample" ? "Saved sample" : "OpenAI"}
                  </small>
                </div>
                <Badge tone={pkg.status === "pending" ? "blue" : "green"}>
                  {pkg.status === "pending" ? "Ready for review" : "Reviewed"}
                </Badge>
                <ChevronRight size={16} />
              </button>
            ))}
          </>
        )}
        {p.notes.length > 0 && (
          <>
            <SectionTitle title="Listing notes" />
            {p.notes.map((n, i) => (
              <p className="saved-note" key={i}>
                {n}
              </p>
            ))}
          </>
        )}
        <div className="detail-agent">
          <Avatar agent={agent} small />
          <span>
            In good hands with <strong>{agent.name}</strong>
          </span>
        </div>
      </div>
    </Modal>
  );
}
