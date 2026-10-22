import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Preferences, Values, Signals } from "./types";
const at = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" }).notNull();
export const profiles = pgTable("workstyle_profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  agentId: text("agent_id"),
  memberId: text("member_id"),
  enabled: boolean("enabled").notNull().default(false),
  revision: integer("revision").notNull().default(0),
  preferences: jsonb("preferences").$type<Preferences>().notNull().default({}),
});
export const standards = pgTable("workstyle_standards", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  brokerageId: text("brokerage_id"),
  locked: jsonb("locked").$type<Values>().notNull().default({}),
  requirements: jsonb("requirements").$type<string[]>().notNull().default([]),
});
export const evidence = pgTable(
  "workstyle_evidence",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    sourceKey: text("source_key").notNull(),
    contextKey: text("context_key").notNull(),
    workflow: text("workflow").notNull(),
    before: text("before").notNull(),
    after: text("after").notNull(),
    signals: jsonb("signals").$type<Signals>().notNull(),
    recordedAt: timestamp("recorded_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    fictional: boolean("fictional").notNull(),
  },
  (t) => [
    uniqueIndex("workstyle_evidence_source").on(t.profileId, t.sourceKey),
  ],
);
export const suggestions = pgTable(
  "workstyle_suggestions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    rule: text("rule").notNull(),
    title: text("title").notNull(),
    why: text("why").notNull(),
    effect: text("effect").notNull(),
    proposed: jsonb("proposed").$type<Values>().notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
    supporting: integer("supporting").notNull(),
    considered: integer("considered").notNull(),
    status: text("status").notNull(),
    createdAt: at(),
  },
  (t) => [uniqueIndex("workstyle_suggestion_rule").on(t.profileId, t.rule)],
);
export const changes = pgTable("workstyle_changes", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  kind: text("kind").notNull(),
  before: jsonb("before").$type<Preferences>().notNull(),
  after: jsonb("after").$type<Preferences>().notNull(),
  suggestionId: text("suggestion_id"),
  undone: boolean("undone").notNull().default(false),
  createdAt: at(),
});
