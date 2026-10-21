"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Inbox,
  MapPin,
  CalendarDays,
  Compass,
} from "lucide-react";
import type { WorkspaceData, Task, Agent } from "@/lib/types";
import {
  AssistantIcon,
  Badge,
  Empty,
  Modal,
  SectionTitle,
  TextLink,
  money,
  shortDate,
  time,
} from "../ui";
import type { View } from "./types";
import { Progress, TaskRow } from "./shared";

export function Today({
  data,
  agent,
  onReview,
  onCapture,
  onProperty,
  onClient,
  onTask,
  onView,
  onWorkforce,
}: {
  data: WorkspaceData;
  agent: Agent;
  onReview: (id?: string) => void;
  onCapture: () => void;
  onProperty: (id: string) => void;
  onClient: (id: string) => void;
  onTask: (task: Task) => void;
  onView: (view: View) => void;
  onWorkforce: () => void;
}) {
  const [taskFilter, setTaskFilter] = useState("open");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const selectedAppointment = data.appointments.find(
    (a) => a.id === appointmentId,
  );
  const tasks = data.tasks.filter((t) => t.agentId === agent.id);
  const open = tasks.filter((t) => t.status === "open");
  const packages = data.packages.filter(
    (p) => p.agentId === agent.id && p.status === "pending",
  );
  const appointments = data.appointments.filter(
    (a) =>
      a.agentId === agent.id &&
      a.startsAt.slice(0, 10) === data.workspace.referenceDate,
  );
  const listings = data.properties.filter((p) => p.agentId === agent.id);
  const primary =
    packages.find((p) => p.propertyId === "willow") || packages[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {new Date(`${data.workspace.referenceDate}T12:00:00`)
              .toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
              .toUpperCase()}{" "}
            <span>•</span> YOUR DAY, IN FOCUS
          </div>
          <h1>
            Good morning, {agent.name.split(" ")[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p>A little less on your plate. A little more possibility.</p>
        </div>
        <button className="button primary" onClick={onCapture}>
          <Plus size={18} />
          New conversation
        </button>
      </div>
      <section className="briefing-hero">
        <div className="briefing-copy">
          <div className="briefing-label">
            <Compass size={17} />
            <span>YOUR MORNING BRIEFING</span>
            <Badge tone="glass">Daily Coordinator</Badge>
          </div>
          <h2>
            {packages.length
              ? "Good relationships start with the little things."
              : "A little space to focus on what’s next."}
          </h2>
          <p>
            {packages.length ? (
              <>
                Your{" "}
                {primary?.clientId === "sarah"
                  ? "follow-up for Sarah"
                  : "client follow-up"}{" "}
                is ready for a look. You have{" "}
                <strong>{open.length} open priorities</strong> and{" "}
                <strong>{appointments.length} appointments</strong> on the
                calendar. Let’s keep things moving.
              </>
            ) : (
              <>
                Your review queue is clear. You have{" "}
                <strong>{open.length} open priorities</strong> and{" "}
                <strong>{appointments.length} appointments</strong> ahead. Your
                approved work is saved and ready.
              </>
            )}
          </p>
          <div className="briefing-bottom">
            <button onClick={() => onReview(primary?.id)}>
              {packages.length
                ? "Let’s review your work"
                : "Open your review workspace"}
              <ArrowRight size={17} />
            </button>
            <span>
              <span className="status-dot" />
              Prepared from your workspace
            </span>
          </div>
        </div>
        <div className="briefing-photo">
          <img
            src="/images/willow.jpg"
            alt="Contemporary home with warm wood accents and a landscaped garden"
          />
          <div className="photo-caption">
            <span>THE NEXT CHAPTER STARTS HERE</span>
            <strong>Room for what matters.</strong>
          </div>
        </div>
      </section>
      <div className="today-grid">
        <div className="today-primary">
          <section className="priorities-section">
            <SectionTitle
              title="Your next best moves"
              aside={
                <div className="segmented">
                  <button
                    className={taskFilter === "open" ? "selected" : ""}
                    onClick={() => setTaskFilter("open")}
                  >
                    To do <span>{open.length}</span>
                  </button>
                  <button
                    className={taskFilter === "done" ? "selected" : ""}
                    onClick={() => setTaskFilter("done")}
                  >
                    Done
                  </button>
                </div>
              }
            />
            {packages.length > 0 && taskFilter === "open" && (
              <button
                className="review-priority"
                onClick={() => onReview(primary?.id)}
              >
                <span className="priority-review-icon">
                  <Inbox size={21} />
                </span>
                <span className="priority-body">
                  <span className="inline-label">
                    READY FOR YOUR REVIEW <span className="mini-dot" />{" "}
                    {packages.length} work{" "}
                    {packages.length === 1 ? "package" : "packages"}
                  </span>
                  <strong>
                    {primary?.title ||
                      "Your assistants have prepared your next steps"}
                  </strong>
                  <small>
                    Thoughtful follow-ups. Organized next steps. All in one
                    review.
                  </small>
                </span>
                <ArrowUpRight size={20} />
              </button>
            )}
            <div className="task-list">
              {tasks
                .filter((t) => t.status === taskFilter)
                .slice(0, 4)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    data={data}
                    onToggle={() => onTask(t)}
                    onProperty={onProperty}
                  />
                ))}
              {!tasks.filter((t) => t.status === taskFilter).length && (
                <Empty
                  title={
                    taskFilter === "done"
                      ? "Your next small win is waiting."
                      : "You’re all caught up."
                  }
                  description={
                    taskFilter === "done"
                      ? "Check off a priority and it will appear here."
                      : "Your next tasks will land here after review."
                  }
                />
              )}
            </div>
          </section>
          <section className="listing-preview">
            <SectionTitle
              title="A little closer to listed"
              aside={
                <TextLink onClick={() => onView("listings")}>
                  All listings
                </TextLink>
              }
            />
            <div className="preview-properties">
              {[
                ...listings,
                ...data.properties.filter((p) => p.agentId !== agent.id),
              ]
                .slice(0, 2)
                .map((p) => (
                  <button
                    className="property-preview"
                    key={p.id}
                    onClick={() => onProperty(p.id)}
                  >
                    <div className="preview-image">
                      <img src={p.image} alt={p.description} />
                      <Badge tone="white">{p.stage}</Badge>
                      <span className="round-arrow">
                        <ArrowUpRight size={17} />
                      </span>
                    </div>
                    <div className="preview-details">
                      <h3>{p.address}</h3>
                      <p>
                        {p.city} ·{" "}
                        {
                          data.agents
                            .find((a) => a.id === p.agentId)
                            ?.name.split(" ")[0]
                        }
                      </p>
                      <div className="property-progress-label">
                        <span>
                          {
                            data.tasks.filter(
                              (t) =>
                                t.propertyId === p.id && t.status === "done",
                            ).length
                          }{" "}
                          of{" "}
                          {
                            data.tasks.filter((t) => t.propertyId === p.id)
                              .length
                          }{" "}
                          tasks complete
                        </span>
                        <span>{money(p.price)}</span>
                      </div>
                      <Progress
                        done={
                          data.tasks.filter(
                            (t) => t.propertyId === p.id && t.status === "done",
                          ).length
                        }
                        total={
                          data.tasks.filter((t) => t.propertyId === p.id).length
                        }
                      />
                    </div>
                  </button>
                ))}
            </div>
          </section>
        </div>
        <aside className="today-secondary">
          <section className="schedule-panel">
            <SectionTitle
              title="On your calendar"
              aside={
                <span className="date-chip">
                  {new Date(`${data.workspace.referenceDate}T12:00:00`)
                    .toLocaleDateString("en-US", { month: "short" })
                    .toUpperCase()}
                  <b>{Number(data.workspace.referenceDate.slice(-2))}</b>
                </span>
              }
            />
            <div className="schedule-list">
              {appointments.map((a, i) => (
                <div className="appointment" key={a.id}>
                  <div className="appointment-time">
                    {time(a.startsAt)}
                    <span>{time(a.endsAt)}</span>
                  </div>
                  <div className={`appointment-content appt-${i}`}>
                    <Badge tone={a.status === "confirmed" ? "green" : "amber"}>
                      {a.status}
                    </Badge>
                    <h3>{a.title}</h3>
                    <p>
                      <MapPin size={12} />
                      {a.location}
                    </p>
                    <button onClick={() => setAppointmentId(a.id)}>
                      View briefing
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {!appointments.length && (
                <Empty
                  title="Room to breathe"
                  description="No appointments on the sample calendar today."
                />
              )}
            </div>
            <div className="calendar-footnote">
              <CalendarDays size={14} />
              Workspace calendar · external sync not connected
            </div>
          </section>
          <section className="workforce-card">
            <div className="workforce-card-top">
              <div className="avatar-stack">
                {[0, 1, 2, 3, 4].map((i) => (
                  <AssistantIcon key={i} index={i} small />
                ))}
              </div>
              <span className="status-dot" />
            </div>
            <h3>A team behind your team.</h3>
            <p>
              Five specialized assistants.
              <br />
              One thoughtful, coordinated workspace.
            </p>
            <button className="text-link" onClick={onWorkforce}>
              Meet your workforce
              <ArrowRight size={14} />
            </button>
          </section>
        </aside>
      </div>
      {selectedAppointment && (
        <Modal
          title={selectedAppointment.title}
          subtitle={`${shortDate(selectedAppointment.startsAt)} · ${time(selectedAppointment.startsAt)} – ${time(selectedAppointment.endsAt)}`}
          onClose={() => setAppointmentId(null)}
        >
          <div className="client-detail">
            <Badge
              tone={
                selectedAppointment.status === "confirmed" ? "green" : "amber"
              }
            >
              {selectedAppointment.status}
            </Badge>
            <div className="client-briefing">
              <div className="eyebrow">YOUR APPOINTMENT BRIEFING</div>
              <p>{selectedAppointment.briefing}</p>
              <small>{selectedAppointment.location}</small>
            </div>
            {selectedAppointment.clientId && (
              <TextLink
                onClick={() => {
                  const id = selectedAppointment.clientId!;
                  setAppointmentId(null);
                  onClient(id);
                }}
              >
                Open client record
              </TextLink>
            )}
            <div className="info-strip">
              <CalendarDays size={17} />
              <p>
                Saved workspace appointment. External calendars are not
                connected.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
