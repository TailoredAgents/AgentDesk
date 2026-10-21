"use client";

import { Check } from "lucide-react";
import type { WorkspaceData, Task } from "@/lib/types";
import { shortDate } from "../ui";

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="progress-track">
      <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}

export function TaskRow({
  task,
  data,
  onToggle,
  onProperty,
}: {
  task: Task;
  data: WorkspaceData;
  onToggle: () => void;
  onProperty?: (id: string) => void;
}) {
  const p = data.properties.find((p) => p.id === task.propertyId);
  return (
    <div className={`task-row ${task.status === "done" ? "is-done" : ""}`}>
      <button
        className="task-check"
        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
        onClick={onToggle}
      >
        {task.status === "done" && <Check size={13} />}
      </button>
      <div className="task-row-body">
        <h3>{task.title}</h3>
        <p>
          {p && onProperty ? (
            <button onClick={() => onProperty(p.id)}>{p.address}</button>
          ) : (
            task.detail
          )}
        </p>
      </div>
      <div className="task-meta">
        {task.priority === "high" && task.status !== "done" && (
          <span className="priority-dot" />
        )}
        <span>{shortDate(task.dueDate)}</span>
      </div>
    </div>
  );
}
