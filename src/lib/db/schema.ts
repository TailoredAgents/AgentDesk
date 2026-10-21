import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Agent, Fact } from "../types";

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
  source: text("source").$type<"note" | "audio" | "sample">().notNull(),
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
  origin: text("origin").$type<"sample" | "openai">().notNull(),
  createdAt: createdAt(),
});
export const proposedActions = pgTable("proposed_actions", {
  id: id(),
  workspaceId: workspaceId(),
  packageId: text("package_id").notNull(),
  position: integer("position").notNull(),
  kind: text("kind")
    .$type<"summary" | "crm_note" | "message" | "task" | "listing_update">()
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
