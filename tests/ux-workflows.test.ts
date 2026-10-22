import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appointmentContext,
  outdatedReviewActions,
  impactTarget,
  reviewGroups,
  reviewSelection,
  savedConversationReview,
  searchableWork,
} from "../src/components/workspace/workflow-navigation";
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
import {
  sampleIntelligenceFacts,
  situationSampleObservations,
} from "../src/lib/intelligence-sample";
import {
  buildSavedSellerContent,
  buildWorkProductSnapshot,
} from "../src/lib/work-product-content";
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

test("Review stays with Sarah after Michael's completed review, partial save and full save", () => {
  const data = fixture();
  const michael = data.packages.find((p) => p.clientId === "michael")!;
  michael.status = "reviewed";
  assert.equal(
    reviewSelection(data.packages, "jordan", michael.id, "pending").tab,
    "reviewed",
  );
  const sarah = data.packages.find((p) => p.clientId === "sarah")!;
  sarah.actions[0].status = "approved";
  let selection = reviewSelection(
    data.packages,
    "jordan",
    sarah.id,
    "reviewed",
  );
  assert.equal(selection.pkg?.clientId, "sarah");
  assert.equal(selection.tab, "pending");
  sarah.actions.forEach((a) => (a.status = "approved"));
  sarah.status = "reviewed";
  selection = reviewSelection(data.packages, "jordan", sarah.id, "pending");
  assert.equal(selection.pkg?.id, sarah.id);
  assert.equal(selection.tab, "reviewed");
  assert.notEqual(
    reviewSelection(data.packages, "olivia", sarah.id, "pending").pkg?.id,
    sarah.id,
  );
  assert.equal(
    reviewSelection([], "jordan", sarah.id, "pending").pkg,
    undefined,
  );
});

test("AI-off fallback uses only a matching saved fictional conversation", () => {
  const data = fixture();
  assert.equal(
    savedConversationReview(data, "jordan", "sarah", "willow")?.id,
    "package-sarah",
  );
  assert.equal(
    savedConversationReview(data, "olivia", "sarah", "willow"),
    undefined,
  );
  assert.equal(savedConversationReview(data, "jordan", "sarah", ""), undefined);
  data.packages.find((p) => p.id === "package-sarah")!.origin = "openai";
  assert.equal(
    savedConversationReview(data, "jordan", "sarah", "willow"),
    undefined,
  );
  data.workspace.sample = false;
  assert.equal(
    savedConversationReview(data, "jordan", "michael", ""),
    undefined,
  );
});

test("appointment warning shows current reviewed facts without changing the confirmed time or source briefing", () => {
  const data = fixture();
  const before = structuredClone(data.appointments);
  const old = data.clientFacts!.find((f) => f.topic === "cleaning")!;
  old.status = "superseded";
  data.clientFacts!.push({
    ...old,
    ...situationSampleObservations[0],
    id: "cleaning-update",
    status: "current",
    supersedes: [old.id],
  });
  const context = appointmentContext(data, "appointment-jordan-sarah");
  assert.ok(context.impacts.length);
  assert.deepEqual(
    context.facts.map((f) => f.id),
    ["cleaning-update"],
  );
  assert.match(context.facts[0].value, /Wednesday/);
  assert.equal(context.facts[0].effectiveDate, "2026-10-28");
  const originalSarah = data.packages.find((p) => p.id === "package-sarah")!;
  assert.ok(
    outdatedReviewActions(data, originalSarah).includes("sarah-message"),
  );
  assert.ok(
    outdatedReviewActions(data, originalSarah).includes("sarah-summary"),
  );
  assert.equal(
    outdatedReviewActions(
      data,
      data.packages.find((p) => p.clientId === "michael"),
    ).length,
    0,
  );
  assert.equal(
    appointmentContext(data, "appointment-michael-tour").impacts.length,
    0,
  );
  assert.deepEqual(data.appointments, before);
  assert.equal(
    data.clientFacts!.find((f) => f.topic === "photography")?.certainty,
    "requested",
  );
  assert.deepEqual(impactTarget(data, context.impacts[0]), {
    kind: "appointment",
    id: "appointment-jordan-sarah",
  });
});

test("review categories preserve each proposal and every saved decision exactly once", () => {
  const data = fixture();
  const actions = data.packages.flatMap((p) => p.actions);
  actions[0].status = "approved";
  actions[1].status = "rejected";
  const original = structuredClone(actions);
  const grouped = reviewGroups(actions).flatMap((g) => g.actions);
  assert.equal(new Set(grouped.map((a) => a.id)).size, actions.length);
  assert.deepEqual(
    [...grouped].sort((a, b) => a.id.localeCompare(b.id)),
    [...original].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.deepEqual(actions, original);
});

test("search finds saved document versions and tasks by their client, title or address; links preserve exact IDs", () => {
  const data = fixture();
  const linkage = {
    kind: "seller_preparation" as const,
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    appointmentId: null,
    sourceConversationId: "conversation-sarah",
    sourcePackageId: "package-sarah",
  };
  const snapshot = buildWorkProductSnapshot(data, linkage);
  const content = buildSavedSellerContent(snapshot);
  data.workProducts.push({
    ...linkage,
    id: "document-one",
    createdAt: "2026-10-23",
    versions: [
      {
        id: "version-two",
        version: 2,
        editRevision: 0,
        status: "pending",
        origin: "sample",
        content,
        originalContent: content,
        snapshot,
        createdAt: "2026-10-23",
        reviewedAt: null,
        reviewer: null,
        hasPdf: false,
        pdfSha256: null,
        history: [],
      },
    ],
  });
  assert.equal(
    searchableWork(data, "Sarah Mitchell").documents[0].version.id,
    "version-two",
  );
  assert.equal(
    searchableWork(data, content.title).documents[0].product.id,
    "document-one",
  );
  assert.ok(searchableWork(data, "Willow").tasks.length);
  const task = data.tasks.find((t) => t.clientId === "sarah")!;
  assert.ok(
    searchableWork(data, task.title).tasks.some((t) => t.id === task.id),
  );
  assert.deepEqual(searchableWork(data, "no-such-record"), {
    documents: [],
    tasks: [],
  });
  const impact = {
    id: "i",
    kind: "document" as const,
    targetId: "document-one",
    versionId: "version-two",
    title: "Document",
    detail: "Outdated",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    factId: "new",
    previousFactId: "old",
  };
  assert.deepEqual(impactTarget(data, impact), {
    kind: "document",
    id: "document-one",
    versionId: "version-two",
  });
  const pkg = data.packages[0];
  assert.deepEqual(
    impactTarget(data, {
      ...impact,
      kind: "message",
      targetId: pkg.actions[0].id,
    }),
    { kind: "review", id: pkg.id },
  );
});
