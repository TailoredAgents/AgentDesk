"use client";
import { useId, useRef, useState } from "react";
import { CalendarDays, Download, LoaderCircle } from "lucide-react";
import type { Task, Appointment, WorkspaceData } from "@/lib/types";
import { Modal } from "../ui";
import { request } from "./client-api";

function scheduleFields(task: Task) {
  const schedule = task.calendarSchedule;
  if (!schedule)
    return {
      date: task.dueDate?.slice(0, 10) || "",
      startTime: "",
      endTime: "",
      timeZone: "America/New_York",
    };
  const parts = (value: string) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: schedule.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
  const start = parts(schedule.startsAt);
  const end = parts(schedule.endsAt);
  return {
    date: `${start.year}-${start.month}-${start.day}`,
    startTime: `${start.hour}:${start.minute}`,
    endTime: `${end.hour}:${end.minute}`,
    timeZone: schedule.timeZone,
  };
}

export function AppointmentCalendar({
  appointment,
}: {
  appointment: Appointment;
}) {
  return appointment.status === "confirmed" ? (
    <a
      className="text-link calendar-download"
      href={`/api/calendar?type=appointment&id=${encodeURIComponent(appointment.id)}`}
    >
      <Download size={13} />
      Download calendar file
    </a>
  ) : (
    <p className="work-product-note">
      Tentative appointment · confirm the schedule before exporting a calendar
      event.
    </p>
  );
}

export function TaskCalendar({
  task,
  data,
  onUpdate,
  notify,
}: {
  task: Task;
  data: WorkspaceData;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="task-calendar-trigger"
        aria-label={`Prepare calendar reminder for ${task.title}`}
        onClick={() => setOpen(true)}
      >
        <CalendarDays size={13} />
        {task.calendarSchedule
          ? "Calendar reminder"
          : "Prepare calendar reminder"}
      </button>
      {open && (
        <ScheduleEditor
          task={task}
          data={data}
          onUpdate={onUpdate}
          notify={notify}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function ScheduleEditor({
  task,
  data,
  onUpdate,
  notify,
  onClose,
}: {
  task: Task;
  data: WorkspaceData;
  onUpdate: (data: WorkspaceData) => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onClose: () => void;
}) {
  const zoneListId = useId();
  const zones = Intl.supportedValuesOf("timeZone");
  const [initial] = useState(() => scheduleFields(task));
  const [date, setDate] = useState(initial.date);
  const [startTime, setStart] = useState(initial.startTime);
  const [endTime, setEnd] = useState(initial.endTime);
  const [timeZone, setZone] = useState(initial.timeZone);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!task.calendarSchedule);
  const submitting = useRef(false);
  const current = data.tasks.find((item) => item.id === task.id) || task;
  const save = async () => {
    if (submitting.current || !confirmed) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      onUpdate(
        await request<WorkspaceData>(
          `/api/tasks/${encodeURIComponent(task.id)}/calendar`,
          "POST",
          {
            date,
            startTime,
            endTime,
            timeZone,
            confirmed: true,
            expectedWorkspaceRevision: data.workspace.revision ?? 0,
          },
        ),
      );
      setEditing(false);
      notify(
        "Confirmed calendar schedule saved. Download and import the file in your calendar; the task remains unchanged.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const format = (value: string, zone: string) =>
    new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    });
  return (
    <Modal
      title="Prepare a calendar reminder"
      subtitle={task.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="calendar-editor">
        <p className="settings-description">
          A task deadline alone is not a confirmed appointment. Choose the
          actual date and times before creating a calendar file.
        </p>
        {current.calendarSchedule && (
          <div className="review-effects-preview">
            <strong>Confirmed schedule</strong>
            <p>
              {format(
                current.calendarSchedule.startsAt,
                current.calendarSchedule.timeZone,
              )}{" "}
              –{" "}
              {format(
                current.calendarSchedule.endsAt,
                current.calendarSchedule.timeZone,
              )}{" "}
              · {current.calendarSchedule.timeZone}
            </p>
            <a
              className="button secondary"
              href={`/api/calendar?type=task&id=${encodeURIComponent(task.id)}`}
            >
              <Download size={15} />
              Download calendar file
            </a>
            {!editing && (
              <button
                className="text-link"
                onClick={() => {
                  const fields = scheduleFields(current);
                  setDate(fields.date);
                  setStart(fields.startTime);
                  setEnd(fields.endTime);
                  setZone(fields.timeZone);
                  setEditing(true);
                  setConfirmed(false);
                }}
              >
                Change confirmed schedule
              </button>
            )}
          </div>
        )}
        {editing && (
          <>
            <div className="calendar-fields">
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  disabled={busy}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                Time zone
                <input
                  list={zoneListId}
                  value={timeZone}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => {
                    setZone(event.target.value);
                    setConfirmed(false);
                  }}
                  placeholder="Choose or search a time zone"
                />
                <datalist id={zoneListId}>
                  {[...new Set([initial.timeZone, ...zones])].map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ").replaceAll("/", " · ")}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={startTime}
                  disabled={busy}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={endTime}
                  disabled={busy}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
            </div>
            {date && startTime && endTime && (
              <div className="schedule-preview">
                <strong>Schedule to confirm</strong>
                <p>
                  {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {startTime}–{endTime}
                  <br />
                  {timeZone.replaceAll("_", " ").replaceAll("/", " · ")}
                </p>
              </div>
            )}
            <label className="consent">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I have confirmed these dates and times. This is not a tentative
                request.
              </span>
            </label>
            <div className="review-effects-preview">
              <p>
                Save this confirmed schedule in AgentDesk, then download a
                calendar file. You must import or save it in your own calendar.
                No invitation is sent and no task is marked complete.
              </p>
            </div>
            <button
              className="button primary"
              disabled={
                busy ||
                !confirmed ||
                !date ||
                !startTime ||
                !endTime ||
                !timeZone.trim()
              }
              onClick={save}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <CalendarDays size={15} />
              )}
              Save confirmed schedule
            </button>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
