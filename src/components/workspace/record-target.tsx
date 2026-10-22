"use client";
import type { Commitment, Task, WorkspaceData } from "@/lib/types";
import { Badge, Modal } from "../ui";
import { AppointmentView } from "./appointment";
import { CommitmentList } from "./commitments";
import { TaskRow } from "./shared";
import { WorkProducts } from "./work-products";
import type { WorkspaceTarget } from "./workflow-navigation";
import { situationImpacts } from "@/lib/intelligence";

export function RecordTarget({
  target,
  data,
  onClose,
  onClient,
  onTask,
  onCommitment,
  onUpdate,
  notify,
}: {
  target: WorkspaceTarget;
  data: WorkspaceData;
  onClose: () => void;
  onClient: (id: string) => void;
  onTask: (task: Task) => void;
  onCommitment: (item: Commitment) => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  if (target.kind === "document")
    return (
      <WorkProducts
        data={data}
        open={{ productId: target.id, versionId: target.versionId }}
        onClose={onClose}
        onUpdate={onUpdate}
        notify={notify}
      />
    );
  if (target.kind === "appointment") {
    const appointment = data.appointments.find((a) => a.id === target.id);
    return appointment ? (
      <AppointmentView
        appointment={appointment}
        data={data}
        onClose={onClose}
        onClient={onClient}
        onUpdate={onUpdate}
        notify={notify}
      />
    ) : null;
  }
  const item =
    target.kind === "task"
      ? data.tasks.find((t) => t.id === target.id)
      : data.commitments.find((c) => c.id === target.id);
  if (!item) return null;
  const impacts = situationImpacts(data).filter(
    (i) => i.kind === target.kind && i.targetId === item.id,
  );
  return (
    <Modal
      title={item.title}
      subtitle={data.clients.find((c) => c.id === item.clientId)?.name}
      onClose={onClose}
    >
      <div className="client-detail">
        {!!impacts.length && (
          <div className="intelligence-warning">
            <strong>Plans changed — check this work</strong>
            {impacts.map((i) => (
              <p key={i.id}>{i.detail}</p>
            ))}
            <button
              className="text-link"
              onClick={() => item.clientId && onClient(item.clientId)}
            >
              Review current client context
            </button>
          </div>
        )}
        {target.kind === "task" ? (
          <>
            <Badge>{item.status}</Badge>
            <TaskRow
              task={item as Task}
              data={data}
              onToggle={() => onTask(item as Task)}
              onUpdate={onUpdate}
              notify={notify}
            />
          </>
        ) : (
          <CommitmentList
            items={[item as Commitment]}
            onChange={onCommitment}
          />
        )}
        <button className="button secondary" onClick={onClose}>
          Back to workspace
        </button>
      </div>
    </Modal>
  );
}
