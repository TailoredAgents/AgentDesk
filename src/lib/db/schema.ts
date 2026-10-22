import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ActionChange, ClientFact } from "../intelligence-types";
import type { Agent, Fact, ReviewAudit } from "../types";
import type {
  WorkProductContent,
  WorkProductSnapshot,
  WorkProductKind,
  WorkProductVersion,
  TaskCalendarSchedule,
} from "../work-product-types";

const id = () => text("id").primaryKey();
const workspaceId = () => text("workspace_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  sample: boolean("sample").notNull().default(false),
  referenceDate: text("reference_date").notNull(),
  sampleVersion: integer("sample_version").notNull().default(1),
  revision: integer("revision").notNull().default(0),
});
export const agents = pgTable("agents", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  initials: text("initials").notNull(),
  color: text("color").notNull(),
  email: text("email").notNull(),
  style: jsonb("style").$type<Agent["style"]>().notNull(),
});
export const clients = pgTable("clients", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  type: text("type").notNull(),
  notes: jsonb("notes").$type<string[]>().notNull().default([]),
});
export const properties = pgTable("properties", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  price: integer("price").notNull(),
  beds: integer("beds").notNull(),
  baths: integer("baths").notNull(),
  sqft: integer("sqft").notNull(),
  stage: text("stage").notNull(),
  image: text("image").notNull(),
  description: text("description").notNull(),
  notes: jsonb("notes").$type<string[]>().notNull().default([]),
  targetDate: text("target_date"),
});
export const conversations = pgTable("conversations", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  title: text("title").notNull(),
  transcript: text("transcript").notNull(),
  source: text("source")
    .$type<"note" | "audio" | "sample" | "followup" | "correction">()
    .notNull(),
  createdAt: createdAt(),
});
export const workPackages = pgTable("work_packages", {
  id: id(),
  workspaceId: workspaceId(),
  conversationId: text("conversation_id").notNull(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  facts: jsonb("facts").$type<Fact[]>().notNull(),
  clarifications: jsonb("clarifications").$type<string[]>().notNull(),
  status: text("status")
    .$type<"pending" | "reviewed">()
    .notNull()
    .default("pending"),
  origin: text("origin").$type<"sample" | "openai" | "human">().notNull(),
  createdAt: createdAt(),
  requestId: text("request_id"),
  recommendationId: text("recommendation_id"),
  signalIds: jsonb("recommendation_signal_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
});
export const proposedActions = pgTable("proposed_actions", {
  id: id(),
  workspaceId: workspaceId(),
  packageId: text("package_id").notNull(),
  position: integer("position").notNull(),
  kind: text("kind")
    .$type<
      | "summary"
      | "crm_note"
      | "message"
      | "task"
      | "listing_update"
      | "question"
      | "intelligence"
      | "task_update"
    >()
    .notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "rejected">()
    .notNull()
    .default("pending"),
  dueDate: text("due_date"),
  sourceQuote: text("source_quote").notNull(),
  certainty: text("certainty")
    .$type<"confirmed" | "requested" | "uncertain">()
    .notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
  original: jsonb("original").$type<ReviewAudit["original"]>().notNull(),
  originalAvailable: boolean("original_available").notNull().default(true),
  change: jsonb("change").$type<ActionChange>(),
});
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: workspaceId(),
    agentId: text("agent_id").notNull(),
    clientId: text("client_id"),
    propertyId: text("property_id"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    dueDate: text("due_date"),
    status: text("status").$type<"open" | "done">().notNull().default("open"),
    priority: text("priority").$type<"high" | "normal">().notNull(),
    source: text("source").notNull(),
    sourceActionId: text("source_action_id"),
    reviewPackageId: text("review_package_id"),
    calendarSchedule: jsonb("calendar_schedule").$type<TaskCalendarSchedule>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tasks_source_action_unique").on(t.sourceActionId)],
);
export const appointments = pgTable("appointments", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id"),
  propertyId: text("property_id"),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  location: text("location").notNull(),
  status: text("status").$type<"confirmed" | "tentative">().notNull(),
  briefing: text("briefing").notNull(),
});
export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspaceId: workspaceId(),
    agentId: text("agent_id").notNull(),
    clientId: text("client_id"),
    propertyId: text("property_id"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    kind: text("kind").notNull(),
    sourceActionId: text("source_action_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("activities_source_action_unique").on(t.sourceActionId)],
);
export const approvedMessages = pgTable("approved_messages", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  sourceActionId: text("source_action_id").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").$type<"approved">().notNull().default("approved"),
  createdAt: createdAt(),
});
export const commitments = pgTable("commitments", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  conversationId: text("conversation_id"),
  kind: text("kind").$type<"follow_up" | "question" | "dependency">().notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  dueDate: text("due_date"),
  status: text("status").$type<"open" | "resolved">().notNull().default("open"),
  sourceQuote: text("source_quote").notNull(),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  sourceActionId: text("source_action_id").unique(),
});

export const workProducts = pgTable("work_products", {
  id: id(),
  workspaceId: workspaceId(),
  kind: text("kind").$type<WorkProductKind>().notNull(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id"),
  propertyId: text("property_id"),
  appointmentId: text("appointment_id"),
  sourceConversationId: text("source_conversation_id"),
  sourcePackageId: text("source_package_id"),
  createdAt: createdAt(),
});
export const workProductVersions = pgTable("work_product_versions", {
  id: id(),
  workspaceId: workspaceId(),
  productId: text("product_id").notNull(),
  version: integer("version").notNull(),
  editRevision: integer("edit_revision").notNull().default(0),
  status: text("status")
    .$type<"pending" | "approved" | "rejected">()
    .notNull()
    .default("pending"),
  origin: text("origin").$type<"sample" | "openai">().notNull(),
  content: jsonb("content").$type<WorkProductContent>().notNull(),
  originalContent: jsonb("original_content")
    .$type<WorkProductContent>()
    .notNull(),
  snapshot: jsonb("snapshot").$type<WorkProductSnapshot>().notNull(),
  requestId: text("request_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  requestMetadata: jsonb("request_metadata")
    .$type<Record<string, string | null>>()
    .notNull(),
  createdAt: createdAt(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
  reviewer: text("reviewer"),
  reviewInputRevision: integer("review_input_revision"),
  pdfBase64: text("pdf_base64"),
  pdfSha256: text("pdf_sha256"),
});
export const workProductAudits = pgTable("work_product_audits", {
  id: id(),
  workspaceId: workspaceId(),
  productId: text("product_id").notNull(),
  versionId: text("version_id").notNull(),
  event: text("event")
    .$type<WorkProductVersion["history"][number]["event"]>()
    .notNull(),
  editRevision: integer("edit_revision").notNull(),
  content: jsonb("content").$type<WorkProductContent>().notNull(),
  actor: text("actor").notNull(),
  createdAt: createdAt(),
});
export const reviewAudits = pgTable("review_audits", {
  id: id(),
  workspaceId: workspaceId(),
  packageId: text("package_id").notNull(),
  actionId: text("action_id").notNull().unique(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  decision: text("decision").$type<"approved" | "rejected">().notNull(),
  original: jsonb("original").$type<ReviewAudit["original"]>().notNull(),
  edited: jsonb("edited").$type<ReviewAudit["edited"]>().notNull(),
  reviewedAt: timestamp("reviewed_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  actor: text("actor").notNull(),
  originalAvailable: boolean("original_available").notNull().default(true),
});

export const clientFacts = pgTable("client_facts", {
  id: id(),
  workspaceId: workspaceId(),
  agentId: text("agent_id").notNull(),
  clientId: text("client_id").notNull(),
  propertyId: text("property_id"),
  topic: text("topic").$type<ClientFact["topic"]>().notNull(),
  value: text("value").notNull(),
  sourceQuote: text("source_quote").notNull(),
  sourceConversationId: text("source_conversation_id").notNull(),
  certainty: text("certainty").$type<ClientFact["certainty"]>().notNull(),
  effectiveDate: text("effective_date"),
  status: text("status").$type<ClientFact["status"]>().notNull(),
  recordedAt: timestamp("recorded_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  reviewedAt: timestamp("reviewed_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  reviewer: text("reviewer").notNull(),
  sourceActionId: text("source_action_id").unique(),
  supersedes: jsonb("supersedes").$type<string[]>().notNull().default([]),
  humanEdited: boolean("human_edited").notNull().default(false),
});
