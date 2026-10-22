"use client";
import { useState } from "react";
import { Check, Clock3, Pencil, History, ArrowUpRight } from "lucide-react";
import type { Activity } from "@/lib/types";
import { Empty, shortDate, time } from "../ui";

export function ActivityFeed({
  items,
  onClient,
  onProperty,
}: {
  items: Activity[];
  onClient: (id: string) => void;
  onProperty: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const category = (kind: string) =>
    ["task_completed", "commitment_resolved", "work_product_approved"].includes(
      kind,
    )
      ? "completed"
      : kind.includes("prepared")
        ? "prepared"
        : "updates";
  const filtered = [...items]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((item) => filter === "all" || category(item.kind) === filter);
  return (
    <div className="activity-feed">
      <nav className="segmented-nav" aria-label="Activity filters">
        {[
          ["all", "All"],
          ["prepared", "Prepared"],
          ["completed", "Completed"],
          ["updates", "Updates"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {filtered.map((item, index) => {
        const group = category(item.kind);
        const Icon =
          group === "completed"
            ? Check
            : group === "prepared"
              ? Clock3
              : item.kind.includes("edited")
                ? Pencil
                : History;
        const day = shortDate(item.createdAt);
        return (
          <div key={item.id}>
            {(index === 0 ||
              shortDate(filtered[index - 1].createdAt) !== day) && (
              <h3 className="activity-day">{day}</h3>
            )}
            <article className="activity-row">
              <span className={`activity-dot ${group}`}>
                <Icon size={16} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <small>
                  {time(item.createdAt)} · {item.kind.replaceAll("_", " ")}
                </small>
                <details>
                  <summary>Details</summary>
                  <p>{item.detail}</p>
                </details>
                {item.clientId ? (
                  <button
                    className="text-link"
                    onClick={() => onClient(item.clientId!)}
                  >
                    Open client <ArrowUpRight size={14} />
                  </button>
                ) : item.propertyId ? (
                  <button
                    className="text-link"
                    onClick={() => onProperty(item.propertyId!)}
                  >
                    Open property <ArrowUpRight size={14} />
                  </button>
                ) : null}
              </div>
            </article>
          </div>
        );
      })}
      {!filtered.length && (
        <Empty
          title="No activity in this view"
          description="Choose another filter, or return after preparing and reviewing work."
          action={
            filter !== "all" ? (
              <button
                className="button secondary"
                onClick={() => setFilter("all")}
              >
                Show all activity
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
