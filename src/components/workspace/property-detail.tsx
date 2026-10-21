"use client";

import { ArrowUpRight, ChevronRight, Check } from "lucide-react";
import type { WorkspaceData, Property, Task } from "@/lib/types";
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

export function PropertyDetail({
  property: p,
  data,
  onClose,
  onTask,
  onReview,
  onClient,
}: {
  property: Property;
  data: WorkspaceData;
  onClose: () => void;
  onTask: (t: Task) => void;
  onReview: (id: string) => void;
  onClient: (id: string) => void;
}) {
  if (!p) return null;
  const tasks = data.tasks.filter((t) => t.propertyId === p.id);
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
          {["Preparation", "Photography", "Ready to list", "On market"].map(
            (stage, i) => (
              <div
                key={stage}
                className={
                  i ===
                  (p.stage === "Active listing"
                    ? 3
                    : p.stage === "Ready to launch"
                      ? 2
                      : 0)
                    ? "current"
                    : i <
                        (p.stage === "Active listing"
                          ? 3
                          : p.stage === "Ready to launch"
                            ? 2
                            : 0)
                      ? "complete"
                      : ""
                }
              >
                <span>
                  {i <
                  (p.stage === "Active listing"
                    ? 3
                    : p.stage === "Ready to launch"
                      ? 2
                      : 0) ? (
                    <Check size={12} />
                  ) : (
                    i + 1
                  )}
                </span>
                <strong>{stage}</strong>
                <small>
                  {i ===
                  (p.stage === "Active listing"
                    ? 3
                    : p.stage === "Ready to launch"
                      ? 2
                      : 0)
                    ? p.stage
                    : i <
                        (p.stage === "Active listing"
                          ? 3
                          : p.stage === "Ready to launch"
                            ? 2
                            : 0)
                      ? "Complete"
                      : "Next milestone"}
                </small>
              </div>
            ),
          )}
        </div>
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
