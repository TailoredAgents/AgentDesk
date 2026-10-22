import test from "node:test";
import assert from "node:assert/strict";
import { buildSavedSellerContent, buildWorkProductContext, buildWorkProductSnapshot, validateWorkProductContent, workProductIntroduction, workProductTitle } from "../src/lib/work-product-content";
import { generateWorkProduct } from "../src/lib/work-product-ai";
import { validateGrounding, type GeneratedPackage } from "../src/lib/ai";
import { ApiError } from "../src/lib/auth";
import type { WorkProductContent } from "../src/lib/work-product-types";
import { sampleAgents, sampleAppointments, sampleClients, sampleCommitments, sampleConversations, samplePackages, sampleProperties, sampleTasks, sampleWorkspace } from "../src/lib/db/seed-data";
import { fictionalAIWorkspace } from "./fixtures/ai-scenarios";

function sampleData() {
  return structuredClone({ ...fictionalAIWorkspace(), workspace: sampleWorkspace, agents: sampleAgents, clients: sampleClients, properties: sampleProperties, tasks: sampleTasks, conversations: sampleConversations, packages: samplePackages, appointments: sampleAppointments, commitments: sampleCommitments });
}
const sellerInput = { kind: "seller_preparation" as const, agentId: "jordan", clientId: "sarah", propertyId: "willow", sourcePackageId: "package-sarah" };
const sellerSnapshot = () => buildWorkProductSnapshot(sampleData(), sellerInput);
const saved = () => { const snapshot = sellerSnapshot(); return { snapshot, content: buildSavedSellerContent(snapshot) }; };

test("seller evidence is deterministic, scoped and includes its selected conversation and operational records", () => {
  const data = sampleData();
  const snapshot = buildWorkProductSnapshot(data, sellerInput);
  assert.deepEqual(snapshot, buildWorkProductSnapshot(data, sellerInput));
  assert.equal(snapshot.client?.id, "sarah");
  assert.equal(snapshot.property?.id, "willow");
  assert.equal(snapshot.sources.find((source) => source.id === "conversation:conversation-sarah")?.text, data.conversations.find((item) => item.id === "conversation-sarah")?.transcript);
  assert.ok(snapshot.sources.some((source) => source.id === "package:package-sarah"));
  assert.ok(snapshot.sources.some((source) => source.id === "commitment:commitment-sarah-photography"));
  assert.ok(snapshot.sources.every((source) => !source.text.includes("Emily Carter")));
  assert.equal(JSON.stringify(snapshot).includes("sarah.mitchell@example.com"), false);
  assert.throws(() => buildWorkProductSnapshot(data, { ...sellerInput, agentId: "maya" }));
  assert.throws(() => buildWorkProductSnapshot(data, { ...sellerInput, sourceConversationId: "conversation-grace" }));
});

test("appointment context uses the selected appointment and rejects a different client's evidence", () => {
  const data = sampleData();
  const context = buildWorkProductContext(data, { kind: "appointment_briefing", agentId: "jordan", appointmentId: "appointment-jordan-sarah" });
  assert.equal(context.snapshot.appointment?.id, "appointment-jordan-sarah");
  assert.equal(context.snapshot.client?.id, "sarah");
  assert.equal(context.snapshot.property?.id, "willow");
  assert.ok(context.snapshot.sources.some((source) => source.id === "appointment:appointment-jordan-sarah"));
  assert.throws(() => buildWorkProductContext(data, { kind: "appointment_briefing", agentId: "jordan", appointmentId: "appointment-jordan-sarah", clientId: "daniel" }));
  assert.throws(() => buildWorkProductContext(data, { kind: "appointment_briefing", agentId: "jordan" }));
});

test("saved seller example is useful source-backed work and is unavailable for other or non-sample listings", () => {
  const { snapshot, content } = saved();
  assert.ok(content.sections.some((section) => section.kind === "general_guidance"));
  assert.ok(content.sections.some((section) => section.kind === "open_questions"));
  const items = content.sections.flatMap((section) => section.items);
  assert.ok(items.some((item) => /Cleaning/.test(item.text) && item.certainty === "confirmed"));
  assert.ok(items.some((item) => /photography/.test(item.text) && item.certainty === "requested"));
  assert.ok(items.some((item) => /patio furniture/.test(item.text) && item.certainty === "uncertain"));
  assert.ok(items.filter((item) => item.certainty === "general").every((item) => item.sourceId === null && item.sourceQuote === null));
  assert.throws(() => buildSavedSellerContent({ ...snapshot, sample: false }));
  assert.throws(() => buildSavedSellerContent({ ...snapshot, client: { id: "another", name: "Another seller" } }));
});

test("fabricated citations and generic advice disguised as a client agreement are rejected", () => {
  const { snapshot, content } = saved();
  const wrongId = structuredClone(content);
  wrongId.sections[0].items[0].sourceId = "conversation:another-client";
  assert.throws(() => validateWorkProductContent(wrongId, snapshot));
  const wrongQuote = structuredClone(content);
  wrongQuote.sections[0].items[0].sourceQuote = "The photographer confirmed the appointment.";
  assert.throws(() => validateWorkProductContent(wrongQuote, snapshot));
  const falseAgreement = structuredClone(content);
  falseAgreement.sections[1].items[0].certainty = "confirmed";
  assert.throws(() => validateWorkProductContent(falseAgreement, snapshot));
  const inventedGeneral = structuredClone(content);
  inventedGeneral.sections[1].items[0].text = "Photography is booked for Tuesday.";
  assert.throws(() => validateWorkProductContent(inventedGeneral, snapshot));
});

test("the introduction cannot carry invented facts outside item evidence", () => {
  const { snapshot, content } = saved();
  content.introduction = "Your photography is booked and the home will sell for $950,000.";
  assert.throws(() => validateWorkProductContent(content, snapshot));
  content.introduction = workProductIntroduction(snapshot);
  content.title = "Your legally binding seller contract";
  assert.throws(() => validateWorkProductContent(content, snapshot));
});

test("prices, property conditions, legal instructions and unconfirmed bookings fail machine validation", () => {
  for (const invalid of ["Cleaning will cost $450.", "Cleaning is booked for Monday. The home has water damage.", "You are legally required to disclose every issue.", "Photography is confirmed for Tuesday.", "Photography is requested for October 29."]) {
    const { snapshot, content } = saved();
    content.sections[0].items[1].text = invalid;
    assert.throws(() => validateWorkProductContent(content, snapshot), invalid);
  }
  const { snapshot, content } = saved();
  content.sections[0].items[1].certainty = "confirmed";
  assert.throws(() => validateWorkProductContent(content, snapshot));
});

test("human edits preserve source provenance while remaining human responsibility", () => {
  const { snapshot, content } = saved();
  content.introduction = "Sarah, I reviewed this preparation guide with you and added my own wording.";
  content.sections[0].items[0].text = "I have checked this plan and will confirm any changes personally.";
  assert.deepEqual(validateWorkProductContent(content, snapshot, { humanEdited: true }), content);
  content.sections[0].items[0].sourceQuote = "A new quote that was never in the record.";
  assert.throws(() => validateWorkProductContent(content, snapshot, { humanEdited: true }));
});

test("a tentative appointment and changed ISO timestamp cannot become a confirmed briefing schedule", () => {
  const data = sampleData();
  const appointment = data.appointments.find((item) => item.id === "appointment-jordan-sarah")!;
  appointment.status = "tentative";
  const snapshot = buildWorkProductSnapshot(data, { kind: "appointment_briefing", agentId: "jordan", appointmentId: appointment.id });
  const source = snapshot.sources.find((item) => item.id === `appointment:${appointment.id}`)!;
  const content: WorkProductContent = {
    title: workProductTitle("appointment_briefing", snapshot), introduction: workProductIntroduction(snapshot),
    sections: [
      { title: "Appointment details", kind: "recorded_facts", items: [{ text: `The appointment is tentative at ${appointment.startsAt}.`, certainty: "uncertain", sourceId: source.id, sourceQuote: source.text }] },
      { title: "Discussion ideas", kind: "general_guidance", items: [{ text: "Review the client's open questions together.", certainty: "general", sourceId: null, sourceQuote: null }] },
    ],
  };
  assert.doesNotThrow(() => validateWorkProductContent(content, snapshot));
  content.sections[0].items[0].text = "Tentative for Friday, October 23, 2026 at 11:00 a.m.";
  assert.doesNotThrow(() => validateWorkProductContent(content, snapshot));
  content.sections[0].items[0].text = "Tentative for Friday, October 23, 2026 at 12:00 p.m.";
  assert.throws(() => validateWorkProductContent(content, snapshot), /time/i);
  content.sections[0].items[0].text = "Tentative for Monday, October 23, 2026 at 11:00 a.m.";
  assert.throws(() => validateWorkProductContent(content, snapshot), /weekday/i);
  content.sections[0].items[0].text = `The appointment is tentative at ${appointment.startsAt}.`;
  content.sections[0].items[0].certainty = "confirmed";
  assert.throws(() => validateWorkProductContent(content, snapshot));
  content.sections[0].items[0].certainty = "uncertain";
  content.sections[0].items[0].text = "The appointment is tentative at 2026-11-23T09:00:00Z.";
  assert.throws(() => validateWorkProductContent(content, snapshot));
});

test("explicit unanswered questions remain uncertain proposals without invented deadlines", () => {
  const transcript = "Sarah asked whether the patio furniture should stay for photography. No answer has been agreed.";
  const generated: GeneratedPackage = {
    summary: "Sarah asked about patio furniture.", facts: [{ text: "The patio furniture decision is unresolved.", certainty: "uncertain", sourceQuote: transcript }], clarifications: [],
    actions: [
      { kind: "summary", title: "Record the conversation", body: "Sarah asked about patio furniture.", certainty: "uncertain", sourceQuote: transcript, dueDate: null },
      { kind: "question", title: "Decide whether patio furniture stays", body: "Should the patio furniture stay for photography?", certainty: "confirmed", sourceQuote: transcript, dueDate: "2026-10-23" },
    ],
  };
  const result = validateGrounding(generated, transcript);
  assert.equal(result.actions[1].certainty, "uncertain");
  assert.equal(result.actions[1].dueDate, null);
});

test("work product generation fails honestly when provider credentials are absent", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(generateWorkProduct(buildWorkProductContext(sampleData(), sellerInput)), (error: unknown) => error instanceof ApiError && error.code === "ai_not_configured");
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
