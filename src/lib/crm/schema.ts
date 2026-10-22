import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  Capability,
  Json,
  ProviderIdentity,
  WriteProposal,
  RecordKind,
} from "./types";
import type { PilotWork, SharedContext } from "./work";
const at = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
export const brokerages = pgTable("crm_brokerages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  loftyTeamId: text("lofty_team_id").notNull(),
});
export const members = pgTable(
  "crm_members",
  {
    id: text("id").primaryKey(),
    brokerageId: text("brokerage_id").notNull(),
    subject: text("subject").notNull().unique(),
    label: text("label").notNull(),
    loftyUserId: text("lofty_user_id").notNull(),
    role: text("role").$type<"agent" | "leader">().notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("crm_member_account").on(t.brokerageId, t.loftyUserId)],
);
export const connections = pgTable("crm_connections", {
  id: text("id").primaryKey(),
  brokerageId: text("brokerage_id").notNull(),
  memberId: text("member_id").notNull().unique(),
  provider: text("provider").notNull().default("lofty"),
  status: text("status").notNull().default("disconnected"),
  tokens: text("tokens"),
  identity: jsonb("identity").$type<ProviderIdentity>(),
  capabilities: jsonb("capabilities")
    .$type<Capability[]>()
    .notNull()
    .default([]),
  epoch: integer("epoch").notNull().default(0),
  lastSyncAt: at("last_sync_at"),
  lastAttemptAt: at("last_attempt_at"),
  errorCode: text("error_code"),
  cooldownUntil: at("cooldown_until"),
  scanId: text("scan_id"),
  scanOffset: integer("scan_offset").notNull().default(0),
  scanStartedAt: at("scan_started_at"),
});
export const states = pgTable("crm_oauth_states", {
  hash: text("hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  memberId: text("member_id").notNull(),
  epoch: integer("epoch").notNull(),
  expiresAt: at("expires_at").notNull(),
});
export const records = pgTable(
  "crm_records",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    kind: text("kind").$type<RecordKind>().notNull(),
    externalId: text("external_id").notNull(),
    leadId: text("lead_id").notNull(),
    data: jsonb("data").$type<Json>().notNull(),
    hash: text("hash").notNull(),
    sourceUpdatedAt: at("source_updated_at"),
    observedAt: at("observed_at").notNull(),
    scanId: text("scan_id"),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    uniqueIndex("crm_record_external").on(t.connectionId, t.kind, t.externalId),
  ],
);
export const runs = pgTable("crm_sync_runs", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  startedAt: at("started_at").notNull(),
  finishedAt: at("finished_at"),
  status: text("status").notNull(),
  count: integer("count").notNull().default(0),
  errorCode: text("error_code"),
  detail: text("detail"),
});
export const writes = pgTable(
  "crm_writes",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    requestId: text("request_id").notNull(),
    epoch: integer("epoch").notNull(),
    proposal: jsonb("proposal").$type<WriteProposal>().notNull(),
    proposedBy: text("proposed_by").notNull(),
    createdAt: at("created_at").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: at("approved_at"),
    status: text("status").notNull(),
    submittedAt: at("submitted_at"),
    confirmedAt: at("confirmed_at"),
    providerResultId: text("provider_result_id"),
    errorCode: text("error_code"),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [uniqueIndex("crm_write_request").on(t.connectionId, t.requestId)],
);
export const events = pgTable("crm_events", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull(),
  memberId: text("member_id").notNull(),
  kind: text("kind").notNull(),
  at: at("at").notNull(),
  detail: jsonb("detail").$type<Json>().notNull(),
});
export const work = pgTable(
  "crm_work",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    leadId: text("lead_id").notNull(),
    requestId: text("request_id").notNull(),
    epoch: integer("epoch").notNull(),
    status: text("status").notNull(),
    inputHash: text("input_hash").notNull(),
    snapshot: jsonb("snapshot").$type<SharedContext>(),
    transcript: text("transcript").notNull(),
    content: jsonb("content").$type<PilotWork>(),
    errorCode: text("error_code"),
    createdAt: at("created_at").notNull(),
  },
  (t) => [uniqueIndex("crm_work_request").on(t.connectionId, t.requestId)],
);
export const facts = pgTable(
  "crm_facts",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    leadId: text("lead_id").notNull(),
    workId: text("work_id").notNull(),
    candidate: integer("candidate").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    certainty: text("certainty").notNull(),
    status: text("status").notNull(),
    reviewedBy: text("reviewed_by").notNull(),
    reviewedAt: at("reviewed_at").notNull(),
    supersedes: jsonb("supersedes").$type<string[]>().notNull(),
  },
  (t) => [uniqueIndex("crm_fact_candidate").on(t.workId, t.candidate)],
);
