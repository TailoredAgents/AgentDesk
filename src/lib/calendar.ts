import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./auth";
import type { Appointment, Task } from "./types";
import type { TaskCalendarSchedule } from "./work-product-types";

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const calendarInputSchema = z.object({
  date: z.string().refine(validDate, "Choose a valid date."),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().min(1).max(100),
  confirmed: z.literal(true),
  expectedWorkspaceRevision: z.number().int().nonnegative(),
}).strict();

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  return Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
}

/** Reject DST gaps and overlaps instead of guessing which instant the agent meant. */
export function localCalendarInstant(date: string, time: string, timeZone: string): string {
  if (!validDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, "Choose a valid calendar date and time.", "invalid_calendar_time");
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  try {
    // Probe both sides of timezone transitions, including half-hour DST shifts.
    for (const hours of [-36, -12, 0, 12, 36]) {
      const probe = new Date(naive + hours * 3600000);
      const p = zonedParts(probe, timeZone);
      offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - probe.getTime());
    }
  } catch { throw new ApiError(400, "Choose a supported IANA time zone, such as America/New_York.", "invalid_time_zone"); }
  const matching = [...offsets].map((offset) => new Date(naive - offset)).filter((instant) => {
    const p = zonedParts(instant, timeZone);
    return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
  });
  if (matching.length !== 1) throw new ApiError(400, matching.length ? "This time occurs twice during the clock change. Choose an unambiguous time." : "This time does not exist during the clock change. Choose another time.", "ambiguous_calendar_time");
  return matching[0].toISOString();
}

export function confirmedTaskSchedule(input: z.infer<typeof calendarInputSchema>, confirmedAt = new Date().toISOString()): TaskCalendarSchedule {
  const clean = calendarInputSchema.parse(input);
  const startsAt = localCalendarInstant(clean.date, clean.startTime, clean.timeZone);
  const endsAt = localCalendarInstant(clean.date, clean.endTime, clean.timeZone);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new ApiError(400, "The end time must be after the start time on the chosen date.", "invalid_calendar_range");
  return { startsAt, endsAt, timeZone: clean.timeZone, confirmedAt, confirmedBy: "Shared workspace reviewer" };
}

function instant(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3])):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-]\d{2}:[0-5]\d)$/.exec(value);
  if (!match || !validDate(match[1]) || !Number.isFinite(Date.parse(value))) throw new ApiError(400, "A confirmed date, time, and time zone are required.", "invalid_calendar_time");
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export function foldCalendarLine(value: string) {
  const lines: string[] = [];
  let current = "", length = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (length + bytes > 75) { lines.push(current); current = " "; length = 1; }
    current += character; length += bytes;
  }
  lines.push(current);
  return lines.join("\r\n");
}

export function createCalendarFile(input: { workspaceId: string; type: "task" | "appointment"; record: Task | Appointment; generatedAt?: string }) {
  const record = input.record;
  const schedule = input.type === "task" ? (record as Task).calendarSchedule : record as Appointment;
  if (!schedule || (input.type === "appointment" && (record as Appointment).status !== "confirmed")) throw new ApiError(409, "Confirm the date and time before creating a calendar file.", "unconfirmed_schedule");
  const start = instant(schedule.startsAt), end = instant(schedule.endsAt);
  if (Date.parse(schedule.endsAt) <= Date.parse(schedule.startsAt)) throw new ApiError(400, "The calendar end must be after its start.", "invalid_calendar_range");
  const id = createHash("sha256").update(`${input.workspaceId}:${input.type}:${record.id}`).digest("hex").slice(0, 32);
  const description = `${input.type === "task" ? (record as Task).detail : (record as Appointment).briefing}\nPrepared in AgentDesk. Import and save this file in your calendar. No invitation was sent and no external calendar was updated.`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tailored Agents//AgentDesk//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${id}@agentdesk.local`, `DTSTAMP:${instant(input.generatedAt || new Date().toISOString())}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeText(record.title)}`, `DESCRIPTION:${escapeText(description)}`, "STATUS:CONFIRMED", "CLASS:PRIVATE", "TRANSP:OPAQUE"];
  if (input.type === "appointment") lines.push(`LOCATION:${escapeText((record as Appointment).location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
