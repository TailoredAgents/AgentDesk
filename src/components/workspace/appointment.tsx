"use client";
import type { Appointment, WorkspaceData } from "@/lib/types";
import { Badge, Modal, shortDate, time, TextLink } from "../ui";
import { appointmentContext } from "./workflow-navigation";
import { AppointmentCalendar } from "./calendar-actions";
import { WorkProducts } from "./work-products";

export function AppointmentView({
  appointment,
  data,
  onClose,
  onClient,
  onUpdate,
  notify,
}: {
  appointment: Appointment;
  data: WorkspaceData;
  onClose: () => void;
  onClient: (id: string) => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  const { impacts, facts } = appointmentContext(data, appointment.id);
  return (
    <Modal
      title={appointment.title}
      subtitle={`${shortDate(appointment.startsAt)} · ${time(appointment.startsAt)} – ${time(appointment.endsAt)}`}
      onClose={onClose}
    >
      <div className="client-detail">
        <Badge tone={appointment.status === "confirmed" ? "green" : "amber"}>
          Appointment {appointment.status}
        </Badge>
        {impacts.length > 0 ? (
          <section
            className="intelligence-warning appointment-warning"
            role="status"
          >
            <h3>Plans changed — review this briefing</h3>
            <p>
              The saved briefing refers to an earlier plan. The appointment time
              has not changed.
            </p>
            <h4>Latest reviewed information</h4>
            {facts.map((fact) => (
              <p key={fact.id}>
                <Badge
                  tone={
                    fact.certainty === "confirmed" && fact.status === "current"
                      ? "green"
                      : "amber"
                  }
                >
                  {fact.status === "retired"
                    ? "No longer current"
                    : fact.certainty}
                </Badge>{" "}
                {fact.value}
              </p>
            ))}
            {appointment.clientId && (
              <TextLink onClick={() => onClient(appointment.clientId!)}>
                Review current client context
              </TextLink>
            )}
            <details>
              <summary>Earlier briefing · retained for reference</summary>
              <p>{appointment.briefing}</p>
            </details>
          </section>
        ) : (
          <div className="client-briefing">
            <div className="eyebrow">YOUR APPOINTMENT BRIEFING</div>
            <p>{appointment.briefing}</p>
          </div>
        )}
        <p>{appointment.location}</p>
        {appointment.clientId && !impacts.length && (
          <TextLink onClick={() => onClient(appointment.clientId!)}>
            Open client record
          </TextLink>
        )}
        <p className="small-text muted">
          Saved workspace appointment. External calendars are not connected.
        </p>
        <AppointmentCalendar appointment={appointment} />
        <WorkProducts
          data={data}
          onUpdate={onUpdate}
          notify={notify}
          filter={{ appointmentId: appointment.id }}
          context={{
            kind: "appointment_briefing",
            agentId: appointment.agentId,
            clientId: appointment.clientId,
            propertyId: appointment.propertyId,
            appointmentId: appointment.id,
          }}
          title="Prepared appointment briefings"
        />
      </div>
    </Modal>
  );
}
