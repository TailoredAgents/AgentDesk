import test from "node:test";
import assert from "node:assert/strict";
import { calendarInputSchema, confirmedTaskSchedule, createCalendarFile, foldCalendarLine, localCalendarInstant } from "../src/lib/calendar";
import type { Appointment, Task } from "../src/lib/types";

const input = { date: "2026-10-23", startTime: "10:00", endTime: "10:30", timeZone: "America/New_York", confirmed: true as const, expectedWorkspaceRevision: 0 };
const task: Task = { id: "task-calendar", agentId: "agent", clientId: "client", propertyId: "property", title: "Discuss preparation", detail: "Confirm the seller's priorities.", dueDate: "2026-10-23", status: "open", priority: "normal", source: "Approved AI proposal", sourceActionId: "approved-action", createdAt: "2026-10-21T12:00:00Z" };

test("calendar exports require explicit confirmation and both valid times", () => {
  for (const bad of [{ ...input, confirmed: false }, { ...input, startTime: "" }, { ...input, date: "2026-02-30" }, { ...input, endTime: "25:10" }]) assert.equal(calendarInputSchema.safeParse(bad).success, false);
  assert.throws(() => createCalendarFile({ workspaceId: "sample", type: "task", record: task }), /Confirm the date/);
});
test("calendar wall times convert correctly across time zones and DST seasons", () => {
  assert.equal(localCalendarInstant("2026-10-23", "10:00", "America/New_York"), "2026-10-23T14:00:00.000Z");
  assert.equal(localCalendarInstant("2026-12-23", "10:00", "America/New_York"), "2026-12-23T15:00:00.000Z");
  assert.equal(localCalendarInstant("2026-10-23", "10:00", "Asia/Kolkata"), "2026-10-23T04:30:00.000Z");
  assert.throws(() => localCalendarInstant("2026-03-08", "02:30", "America/New_York"), /does not exist/);
  assert.throws(() => localCalendarInstant("2026-11-01", "01:30", "America/New_York"), /occurs twice/);
  assert.throws(() => localCalendarInstant("2026-10-23", "10:00", "NoSuch/Zone"), /supported IANA/);
  assert.throws(() => confirmedTaskSchedule({ ...input, endTime: "09:00" }), /end time must be after/);
});
test("ICS uses UTC instants, stable workspace-scoped IDs and never sends invitations", () => {
  const record = { ...task, calendarSchedule: confirmedTaskSchedule(input, "2026-10-21T12:00:00Z") };
  const options = { workspaceId: "sample", type: "task" as const, record, generatedAt: "2026-10-21T12:00:00Z" };
  const ics = createCalendarFile(options);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.match(ics, /DTSTART:20261023T140000Z\r\nDTEND:20261023T143000Z/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(/ATTENDEE|ORGANIZER|METHOD:REQUEST/.test(ics), false);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/UID:(.+)/)?.[1], createCalendarFile({ ...options, generatedAt: "2026-10-22T12:00:00Z" }).match(/UID:(.+)/)?.[1]);
  assert.notEqual(ics.match(/UID:(.+)/)?.[1], createCalendarFile({ ...options, workspaceId: "another" }).match(/UID:(.+)/)?.[1]);
});
test("calendar text cannot inject events and UTF-8 folding respects 75-byte lines", () => {
  const title = "Café 🏡; " .repeat(25) + "\r\nEND:VEVENT\r\nBEGIN:VEVENT";
  const ics = createCalendarFile({ workspaceId: "sample", type: "task", record: { ...task, title, calendarSchedule: confirmedTaskSchedule(input) } });
  assert.equal((ics.match(/^BEGIN:VEVENT$/gm) || []).length, 1);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
  const value = "é".repeat(100);
  assert.equal(foldCalendarLine(value).replace(/\r\n /g, ""), value);
});
test("tentative appointments and invalid source timestamps cannot be exported", () => {
  const appointment: Appointment = { id: "appointment", agentId: "agent", clientId: "client", propertyId: "property", title: "Photography", startsAt: "2026-10-27T14:00:00-04:00", endsAt: "2026-10-27T15:00:00-04:00", location: "1420 Willow Lane", status: "tentative", briefing: "Photographer has not confirmed." };
  assert.throws(() => createCalendarFile({ workspaceId: "sample", type: "appointment", record: appointment }), /Confirm the date/);
  assert.throws(() => createCalendarFile({ workspaceId: "sample", type: "appointment", record: { ...appointment, status: "confirmed", startsAt: "2026-02-30T14:00:00Z" } }), /confirmed date/);
  const ics = createCalendarFile({ workspaceId: "sample", type: "appointment", record: { ...appointment, status: "confirmed" } });
  assert.match(ics, /DTSTART:20261027T180000Z/);
});
