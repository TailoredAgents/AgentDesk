import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isOverdue,
  listingMilestones,
  orderedTasks,
  teamInsights,
} from "../src/lib/workspace-insights";
import type { Property, Task, WorkspaceData } from "../src/lib/types";

const property: Property = {
  id: "home",
  agentId: "agent",
  clientId: "client",
  address: "Fictional home",
  city: "Sample",
  price: 0,
  beds: 3,
  baths: 2,
  sqft: 1000,
  stage: "Active listing",
  image: "",
  description: "",
  notes: [],
  targetDate: "2026-10-26",
};
const task = (
  id: string,
  dueDate: string | null,
  status: Task["status"] = "open",
): Task => ({
  id,
  agentId: "agent",
  clientId: "client",
  propertyId: "home",
  title: id,
  detail: "Recorded next step",
  dueDate,
  status,
  priority: "normal",
  source: "sample",
  createdAt: "2026-10-21T12:00:00Z",
});

test("today priorities distinguish overdue, due today, unknown dates, and completed records", () => {
  const overdue = task("Photographer confirmation", "2026-10-22");
  const today = task("Prepare checklist", "2026-10-23");
  const undated = task("Ask about staging", null);
  const done = task("Completed follow-up", "2026-10-20", "done");
  assert.equal(isOverdue(overdue, "2026-10-23"), true);
  for (const item of [today, undated, done])
    assert.equal(isOverdue(item, "2026-10-23"), false);
  assert.deepEqual(
    orderedTasks([undated, today, overdue], "2026-10-23").map(
      (item) => item.id,
    ),
    [overdue.id, today.id, undated.id],
  );
});

test("listing stages never fabricate photography completion or infer completion from missing tasks", () => {
  const tasks = [
    task("Photography confirmation", "2026-10-22"),
    task("Cleaning checklist", "2026-10-22", "done"),
    {
      ...task("Photography completed elsewhere", null, "done"),
      propertyId: "another-home",
    },
  ];
  const milestones = listingMilestones(property, tasks);
  assert.equal(milestones[0].complete, true);
  assert.equal(milestones[1].complete, false);
  assert.equal(milestones[1].detail, "0 of 1 tasks complete");
  assert.equal(listingMilestones(property, [])[0].complete, false);
  assert.match(milestones[2].detail, /target only/);
});

test("team insights separate saved sample work from actual live AI usage", () => {
  const data: WorkspaceData = {
    workspace: {
      id: "sample",
      name: "Sample",
      sample: true,
      referenceDate: "2026-10-23",
    },
    agents: [],
    clients: [],
    properties: [property],
    tasks: [task("Overdue seller follow-up", "2026-10-22")],
    conversations: [],
    appointments: [],
    activities: [],
    commitments: [],
    recommendations: [],
    reviewHistory: [],
    workProducts: [],
    capabilities: {
      ai: false,
      transcription: false,
      externalSend: false,
      crmSync: false,
    },
    packages: [
      {
        id: "saved",
        conversationId: "source",
        agentId: "agent",
        clientId: "client",
        propertyId: "home",
        title: "Saved sample",
        summary: "",
        facts: [],
        clarifications: [],
        actions: [],
        status: "pending",
        origin: "sample",
        createdAt: "2026-10-21T12:00:00Z",
      },
    ],
  };
  const result = teamInsights(data);
  assert.equal(result.liveUsers, 0);
  assert.equal(result.livePackages.length, 0);
  assert.equal(result.agentReviews, 1);
  assert.equal(result.overdue.length, 1);
  assert.equal(result.listings.length, 1);
  assert.match(
    result.coaching,
    /does not establish that a client was contacted/,
  );
});
