import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  compareObservation,
  currentContextText,
  prepareIntelligenceActions,
  situationImpacts,
  mentionsFact,
  previousFacts,
} from "../src/lib/intelligence";
import { validateObservations } from "../src/lib/intelligence-validation";
import {
  baselineStatements,
  sampleIntelligenceFacts,
  situationSampleObservations,
  situationSampleTranscript,
} from "../src/lib/intelligence-sample";
import {
  sampleWorkspace,
  sampleAgents,
  sampleClients,
  sampleProperties,
  sampleTasks,
  sampleConversations,
  samplePackages,
  sampleAppointments,
  sampleCommitments,
} from "../src/lib/db/seed-data";
import { buildAIContext, buildProviderContext } from "../src/lib/ai-context";
import { deriveFollowUps } from "../src/lib/follow-ups";
import type { WorkspaceData } from "../src/lib/types";

function fixture(): WorkspaceData {
  return structuredClone({
    workspace: sampleWorkspace,
    agents: sampleAgents,
    clients: sampleClients,
    properties: sampleProperties,
    tasks: sampleTasks,
    conversations: sampleConversations,
    packages: samplePackages,
    appointments: sampleAppointments,
    commitments: sampleCommitments,
    recommendations: [],
    activities: [],
    reviewHistory: [],
    workProducts: [],
    clientFacts: sampleIntelligenceFacts(),
    capabilities: {
      ai: false,
      transcription: false,
      externalSend: false,
      crmSync: false,
    },
  });
}
const scope = { agentId: "jordan", clientId: "sarah", propertyId: "willow" };

test("explicit preferences retain evidence; inferred or sensitive claims are rejected", () => {
  const preference = baselineStatements[1];
  assert.deepEqual(validateObservations([preference], preference.sourceQuote), [
    preference,
  ]);
  assert.throws(
    () =>
      validateObservations(
        [{ ...preference, value: "Sarah is anxious." }],
        preference.sourceQuote,
      ),
    /quote/,
  );
  assert.throws(
    () =>
      validateObservations(
        [
          {
            ...preference,
            value: "Sarah prefers texts because she is anxious.",
            sourceQuote: "Sarah prefers texts because she is anxious.",
          },
        ],
        "Sarah prefers texts because she is anxious.",
      ),
    /practical/,
  );
  assert.throws(
    () =>
      validateObservations(
        [
          {
            ...preference,
            value: "Sarah sent a text update.",
            sourceQuote: "Sarah sent a text update.",
          },
        ],
        "Sarah sent a text update.",
      ),
    /explicit/,
  );
});
test("confirmed rescheduling replaces a plan; requests and conflicts retain confirmed plans", () => {
  const facts = sampleIntelligenceFacts();
  const cleaning = facts.filter((f) => f.topic === "cleaning");
  const observed = validateObservations(
    situationSampleObservations,
    situationSampleTranscript,
  );
  assert.equal(observed[0].effectiveDate, "2026-10-28");
  assert.equal(observed[1].effectiveDate, "2026-10-29");
  assert.equal(
    compareObservation(observed[0], cleaning)?.disposition,
    "replace",
  );
  assert.equal(
    compareObservation({ ...observed[0], certainty: "requested" }, cleaning)
      ?.disposition,
    "request",
  );
  assert.equal(
    compareObservation({ ...observed[0], certainty: "uncertain" }, cleaning)
      ?.disposition,
    "conflict",
  );
  assert.equal(
    compareObservation({ ...observed[0], intent: "information" }, cleaning)
      ?.disposition,
    "conflict",
  );
  assert.equal(compareObservation(baselineStatements[2], cleaning), null);
  assert.equal(
    compareObservation(
      observed[1],
      facts.filter((f) => f.topic === "photography"),
    )?.disposition,
    "replace",
  );
});
test("event dates require a year and matching weekday; uncertain bookings are downgraded", () => {
  const o = situationSampleObservations[0];
  const noYear = {
    ...o,
    value: o.value.replace(", 2026", ""),
    sourceQuote: o.sourceQuote.replace(", 2026", ""),
  };
  assert.equal(
    validateObservations([noYear], noYear.sourceQuote)[0].effectiveDate,
    null,
  );
  const wrongDay = {
    ...o,
    value: o.value.replace("Wednesday", "Tuesday"),
    sourceQuote: o.sourceQuote.replace("Wednesday", "Tuesday"),
  };
  assert.equal(
    validateObservations([wrongDay], wrongDay.sourceQuote)[0].effectiveDate,
    null,
  );
  assert.equal(
    validateObservations(
      [{ ...situationSampleObservations[1], certainty: "confirmed" }],
      situationSampleTranscript,
    )[0].certainty,
    "requested",
  );
});
test("pending extraction is idempotent and does not cross relationship boundaries", () => {
  const data = fixture();
  const actions = prepareIntelligenceActions(
    data,
    scope,
    situationSampleObservations,
    randomUUID,
  );
  assert.equal(actions.length, 2);
  data.packages.push({ ...data.packages[0], id: "second", actions });
  assert.equal(
    prepareIntelligenceActions(
      data,
      scope,
      situationSampleObservations,
      randomUUID,
    ).length,
    0,
  );
  const other = prepareIntelligenceActions(
    data,
    { agentId: "olivia", clientId: "robert", propertyId: "oak" },
    situationSampleObservations,
    randomUUID,
  );
  assert.equal(other.length, 2);
  assert.ok(
    other.every((a) => a.change?.type === "fact" && !a.change.before.length),
  );
});
test("superseded facts are removed from shared context and follow-up evidence", () => {
  const data = fixture();
  const old = data.clientFacts!.find((f) => f.topic === "cleaning")!;
  old.status = "superseded";
  const next = {
    ...old,
    id: "new-cleaning",
    status: "current" as const,
    ...situationSampleObservations[0],
    supersedes: [old.id],
  };
  data.clientFacts!.push(next);
  data.tasks.push({
    ...data.tasks[0],
    ...scope,
    id: "old-cleaning-task",
    title: "Cleaning booked for Monday",
    detail: "Check the preparation plan.",
  });
  const context = buildAIContext(
    data,
    "jordan",
    "sarah",
    "willow",
    "A new conversation.",
  );
  assert.equal(
    context.relationship!.reviewedIntelligence!.find(
      (f) => f.topic === "cleaning",
    )!.effectiveDate,
    "2026-10-28",
  );
  assert.doesNotMatch(
    JSON.stringify(buildProviderContext(context)),
    /Cleaning booked for Monday|cleaning is booked for Monday|cleaners are booked for Monday/i,
  );
  assert.doesNotMatch(
    deriveFollowUps(data).find((r) => r.clientId === "sarah")!.sourceSnapshot,
    /Cleaning booked for Monday|cleaning is booked for Monday|cleaners are booked for Monday/i,
  );
  assert.equal(
    currentContextText("Keep this unrelated question.", data.clientFacts!),
    "Keep this unrelated question.",
  );
  assert.equal(
    situationImpacts(data).some(
      (i) => i.clientId !== "sarah" || i.propertyId !== "willow",
    ),
    false,
  );
  assert.equal(
    situationImpacts(data).some((i) => i.targetId === "task-willow-disclosure"),
    false,
  );
  assert.equal(
    buildAIContext(
      data,
      "jordan",
      "sarah",
      null,
      "A new conversation.",
    ).relationship!.reviewedIntelligence!.some((f) => f.propertyId),
    false,
  );
});

test("impact matching follows the full change history without treating a different dated Monday as the old plan", () => {
  const old = sampleIntelligenceFacts().find((f) => f.topic === "cleaning")!;
  assert.equal(mentionsFact("Cleaning is booked for Monday.", old), true);
  assert.equal(
    mentionsFact("Cleaning is booked for Monday, November 2, 2026.", old),
    false,
  );
  const middle = {
    ...old,
    id: "middle",
    effectiveDate: "2026-10-28",
    supersedes: [old.id],
  };
  const newest = {
    ...middle,
    id: "newest",
    effectiveDate: "2026-10-30",
    supersedes: [middle.id],
  };
  assert.deepEqual(
    previousFacts(newest, [old, middle, newest]).map((f) => f.id),
    [old.id, middle.id],
  );
});
