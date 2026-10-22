"use client";

import type { Commitment } from "@/lib/types";
import { Badge, shortDate } from "../ui";

export function CommitmentList({
  items,
  onChange,
  outdatedIds = [],
}: {
  items: Commitment[];
  outdatedIds?: string[];
  onChange: (item: Commitment) => void;
}) {
  return (
    <div className="detail-task-list">
      {items.map((item) => (
        <div className="saved-note" key={item.id}>
          <Badge tone={item.status === "resolved" ? "green" : "amber"}>
            {item.status} · {item.kind.replace("_", " ")}
          </Badge>
          <h3>{item.title}</h3>
          {outdatedIds.includes(item.id) && (
            <p className="intelligence-warning">
              This commitment refers to an earlier plan. Check the current
              client situation before acting.
            </p>
          )}
          <p>{item.detail}</p>
          {item.sourceQuote && <blockquote>“{item.sourceQuote}”</blockquote>}
          <p className="small-text muted">
            {item.dueDate
              ? `Due ${shortDate(item.dueDate)}`
              : "No confirmed deadline"}
            {item.resolvedAt ? ` · Resolved ${shortDate(item.resolvedAt)}` : ""}
          </p>
          <button
            className="button secondary small"
            onClick={() => onChange(item)}
          >
            {item.status === "open" ? "Mark resolved" : "Reopen commitment"}
          </button>
        </div>
      ))}
    </div>
  );
}
