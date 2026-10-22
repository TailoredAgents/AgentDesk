"use client";
import { IntelligenceExceptions } from "./intelligence";

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
import { orderedTasks } from "@/lib/workspace-insights";
import {
  AssistantIcon,
  Badge,
  Empty,
  SectionTitle,
  TextLink,
  money,
  shortDate,
  time,
} from "../ui";
import type { View } from "./types";
import { Progress, TaskRow } from "./shared";
import { WorkProducts } from "./work-products";
import { AppointmentView } from "./appointment";

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
  onFollowUp,
  onRefresh,
  refreshing,
  onUpdate,
  notify,
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
  onFollowUp: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [taskFilter, setTaskFilter] = useState("open");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const selectedAppointment = data.appointments.find(
    (a) => a.id === appointmentId,
  );
  const tasks = orderedTasks(
    data.tasks.filter((t) => t.agentId === agent.id),
    data.workspace.referenceDate,
  );
  const open = tasks.filter((t) => t.status === "open");
  const packages = data.packages.filter(
    (p) => p.agentId === agent.id && p.status === "pending",
  );
  const appointments = data.appointments
    .filter(
      (a) =>
        a.agentId === agent.id &&
        a.startsAt.slice(0, 10) >= data.workspace.referenceDate,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);
  const listings = data.properties.filter((p) => p.agentId === agent.id);
  const recommendations = data.recommendations.filter(
    (item) => item.agentId === agent.id,
  );
  const next = recommendations[0];
  const representedTasks = new Set(recommendations.flatMap((r) => r.taskIds));
  const visibleTasks = tasks.filter(
    (t) =>
      t.status === taskFilter &&
      (showAllTasks ||
        taskFilter === "done" ||
        (!representedTasks.has(t.id) &&
          !packages.some((p) => p.id === t.reviewPackageId))),
  );
  const otherPackages = packages.filter(
    (p) => !recommendations.some((r) => r.packageId === p.id),
  );
  const primary = packages.find((p) => p.id === next?.packageId) || packages[0];
  const nextClient = data.clients.find(
    (client) => client.id === next?.clientId,
  );
  const heroProperty =
    listings.find((property) => property.id === next?.propertyId) ||
    listings[0];
  return (
    <>
      {agent.workstyle?.values.briefingShortcut === "show" &&
        appointments[0] && (
          <div className="personal-workflow-shortcut">
            <CalendarDays size={19} />
            <div>
              <strong>Your appointment preparation</strong>
              <p>
                {appointments[0].title} · Personal shortcut · Drafts require
                review
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => setAppointmentId(appointments[0].id)}
            >
              Open preparation <ArrowRight size={14} />
            </button>
          </div>
        )}
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
            {next
              ? `Follow up with ${nextClient?.name}.`
              : packages.length
                ? "Good relationships start with the little things."
                : "A little space to focus on what’s next."}
          </h2>
          <p>
            {next ? (
              <>
                {next.reason.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) =>
                  shortDate(date),
                )}
              </>
            ) : (
              <>
                {packages.length
                  ? `${packages.length} conversations are ready for your review.`
                  : "Your review queue is clear."}{" "}
                You have <strong>{open.length} open priorities</strong> and{" "}
                <strong>{appointments.length} appointments</strong> ahead. Your
                approved work is saved and ready.
              </>
            )}
          </p>
          <div className="briefing-bottom">
            <button
              onClick={() =>
                next ? onFollowUp(next.id) : onReview(primary?.id)
              }
            >
              {next
                ? "Open your next follow-up"
                : packages.length
                  ? "Let’s review your work"
                  : "Open your review workspace"}
              <ArrowRight size={17} />
            </button>
            <span>
              <span className="status-dot" />
              Records evaluated for {shortDate(data.workspace.referenceDate)}
            </span>
          </div>
        </div>
        <div className="briefing-photo">
          <img
            src={heroProperty?.image || "/images/cedar.jpg"}
            alt={
              heroProperty?.description ||
              "A home in the fictional sample workspace"
            }
          />
          <div className="photo-caption">
            <span>THE NEXT CHAPTER STARTS HERE</span>
            <strong>Room for what matters.</strong>
          </div>
        </div>
      </section>
      <IntelligenceExceptions
        compact
        data={data}
        agentId={agent.id}
        onClient={onClient}
        onReview={onReview}
      />
      <div className="today-grid">
        <div className="today-primary">
          <WorkProducts
            data={data}
            filter={{ agentId: agent.id }}
            pendingOnly
            onUpdate={onUpdate}
            notify={notify}
            title="Documents ready for review"
          />
          {otherPackages.length > 0 && (
            <section className="priorities-section">
              <SectionTitle title="Conversations ready for review" />
              {otherPackages.map((p) => (
                <button
                  key={p.id}
                  className="review-priority"
                  onClick={() => onReview(p.id)}
                >
                  <Inbox size={20} />
                  <span className="priority-body">
                    <strong>
                      {data.clients.find((c) => c.id === p.clientId)?.name}
                    </strong>
                    <small>
                      {p.title} ·{" "}
                      {p.actions.filter((a) => a.status === "pending").length}{" "}
                      decisions
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </section>
          )}
          <details className="priorities-section secondary-priorities">
            <summary>
              Other follow-ups{" "}
              <span>{Math.max(0, recommendations.length - 1)}</span>
            </summary>
            <SectionTitle
              title="Other client follow-ups"
              aside={
                <TextLink onClick={onRefresh}>
                  {refreshing ? "Preparing…" : "Refresh & prepare"}
                </TextLink>
              }
            />
            <p className="small-text muted">
              Relationship Assistant · evaluated from saved records on refresh.
              No background monitoring.
            </p>
            {recommendations.slice(1).map((item) => (
              <button
                key={item.id}
                className="review-priority"
                onClick={() => onFollowUp(item.id)}
              >
                <AssistantIcon index={2} />
                <span className="priority-body">
                  <span className="inline-label">
                    {item.urgency} ·{" "}
                    {item.status === "ready_for_review"
                      ? "Draft ready for review"
                      : item.status === "approved_draft"
                        ? "Approved draft · follow-up still open"
                        : item.status === "reviewed"
                          ? "Review recorded · follow-up still open"
                          : "Context ready"}
                  </span>
                  <strong>
                    {
                      data.clients.find((client) => client.id === item.clientId)
                        ?.name
                    }{" "}
                    — {item.title}
                  </strong>
                  <small>
                    {item.reason.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) =>
                      shortDate(date),
                    )}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
            {recommendations.length <= 1 && (
              <Empty
                title="No other follow-ups to flag"
                description="Your next follow-up is shown above when one needs attention. Refresh to check the latest saved records."
              />
            )}
          </details>
          <section className="priorities-section">
            <SectionTitle
              title={showAllTasks ? "All your tasks" : "Other tasks"}
              aside={
                <div className="segmented">
                  <button
                    className={taskFilter === "open" ? "selected" : ""}
                    onClick={() => setTaskFilter("open")}
                  >
                    To do
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
            <button
              className="text-link task-scope-toggle"
              aria-pressed={showAllTasks}
              onClick={() => setShowAllTasks(!showAllTasks)}
            >
              {showAllTasks
                ? "Show other tasks only"
                : `All tasks · ${open.length} to do`}
            </button>
            <div className="task-list">
              {visibleTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  data={data}
                  onToggle={() => onTask(t)}
                  onProperty={onProperty}
                  onUpdate={onUpdate}
                  notify={notify}
                />
              ))}
              {!visibleTasks.length && (
                <Empty
                  title={
                    taskFilter === "done"
                      ? "Your next small win is waiting."
                      : "No other tasks to show."
                  }
                  description={
                    taskFilter === "done"
                      ? "Check off a priority and it will appear here."
                      : "Follow-up and review tasks are grouped with their work above. Use All tasks to see every item."
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
              {listings.slice(0, 2).map((p) => (
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
                            (t) => t.propertyId === p.id && t.status === "done",
                          ).length
                        }{" "}
                        of{" "}
                        {data.tasks.filter((t) => t.propertyId === p.id).length}{" "}
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
              {!listings.length && (
                <Empty
                  title="No assigned listings"
                  description="Your buyer follow-ups and commitments are shown above."
                />
              )}
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
                    {a.startsAt.slice(0, 10) !==
                      data.workspace.referenceDate && (
                      <span>{shortDate(a.startsAt)}</span>
                    )}
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
              Eastern time · workspace calendar · external sync not connected
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
        <AppointmentView
          appointment={selectedAppointment}
          data={data}
          onUpdate={onUpdate}
          notify={notify}
          onClient={(id) => {
            setAppointmentId(null);
            onClient(id);
          }}
          onClose={() => setAppointmentId(null)}
        />
      )}
    </>
  );
}
