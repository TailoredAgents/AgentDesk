import { z } from "zod";

export const contextSchema = z
  .object({
    page: z.enum(["today", "review", "listings", "team"]),
    clientId: z.string().max(120).nullable(),
    propertyId: z.string().max(120).nullable(),
    packageId: z.string().max(120).nullable(),
    documentId: z.string().max(120).nullable(),
  })
  .strict();
export type PageContext = z.infer<typeof contextSchema>;
// Only trusted channel adapters construct principals. Never accept this from a model.
export type Principal = {
  kind: "sample";
  workspaceId: string;
  ownerId: string;
  agentId: string;
};
export const targetSchema = z.object({
  kind: z.enum([
    "client",
    "property",
    "review",
    "document",
    "task",
    "appointment",
    "commitment",
  ]),
  id: z.string().min(1).max(240),
  versionId: z.string().max(120).optional(),
});
export type Target = z.infer<typeof targetSchema>;
export const artifactSchema = z.object({
  title: z.string().max(200),
  state: z.enum(["found", "awaiting_review", "approved", "reused"]),
  detail: z.string().max(300),
  target: targetSchema,
});
export type Artifact = z.infer<typeof artifactSchema>;
export const resultSchema = z.object({
  state: z.enum([
    "found",
    "prepared",
    "requires_information",
    "unavailable",
    "failed",
  ]),
  data: z.unknown(),
  artifacts: z.array(artifactSchema).max(15),
  sourceIds: z.array(z.string().max(240)).max(120),
});
export type ToolResult = z.infer<typeof resultSchema>;
export type Execution = {
  id: string;
  callId: string;
  name: string;
  args: string;
  result?: ToolResult;
  durationMs?: number;
};
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  providerCalls: number;
};
export type Reply = {
  text: string;
  artifacts: Artifact[];
  sourceIds: string[];
};
export type Turn = {
  mode: "live" | "example";
  id: string;
  text: string;
  context: PageContext;
  status: "running" | "completed" | "failed";
  reply: Reply | null;
  error: string | null;
  calls: Execution[];
  usage: Usage;
  durationMs: number;
  createdAt: string;
};
export type ConversationState = {
  id: string;
  turns: Turn[];
  expiresAt: string;
};
export const enabled = () => process.env.AGENTDESK_COPILOT_ENABLED === "true";
