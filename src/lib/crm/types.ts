export type RecordKind = "lead" | "note" | "task" | "activity" | "transaction";
export type Capability =
  | "leads.read"
  | "notes.read"
  | "tasks.read"
  | "activities.read"
  | "transactions.read"
  | "notes.create"
  | "tasks.create"
  | "tasks.update";
export type Json = Record<string, unknown>;
export type Projection = {
  kind: RecordKind;
  externalId: string;
  leadId: string;
  data: Json;
  sourceUpdatedAt: string | null;
  deleted?: boolean;
};
export type ProviderIdentity = {
  userId: string;
  teamId: string;
  label: string;
  timezone: string;
};
export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};
export type WriteProposal = {
  operation: "notes.create" | "tasks.create" | "tasks.update";
  leadId: string;
  targetId?: string;
  content: string;
  endAt?: string;
  expectedHash?: string;
};
export type Page = {
  records: Projection[];
  nextOffset: number | null;
  total: number;
};
export interface CrmProvider {
  id: string;
  capabilities: readonly Capability[];
  exchange(code: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  identity(token: string): Promise<ProviderIdentity>;
  leads(token: string, userId: string, offset: number): Promise<Page>;
  lead(token: string, id: string): Promise<Projection>;
  related(
    token: string,
    kind: Exclude<RecordKind, "lead">,
    leadId: string,
  ): Promise<{ records: Projection[]; complete: boolean }>;
  record(token: string, kind: "note" | "task", id: string): Promise<Projection>;
  write(
    token: string,
    proposal: WriteProposal,
  ): Promise<{ externalId: string }>;
}
export class ProviderError extends Error {
  constructor(
    public code:
      | "unauthorized"
      | "permission"
      | "unavailable"
      | "rate_limited"
      | "invalid_response"
      | "network"
      | "rejected",
    public retryAfterSeconds = 60,
  ) {
    super(`Lofty request: ${code}`);
  }
}
export const capabilityLabels: Record<Capability, string> = {
  "leads.read": "Assigned leads & contact details",
  "notes.read": "CRM notes",
  "tasks.read": "Tasks & appointments",
  "activities.read": "Lofty communication timeline",
  "transactions.read": "Lead transactions",
  "notes.create": "Create approved notes",
  "tasks.create": "Create approved tasks",
  "tasks.update": "Update approved task text / deadline",
};
export const allCapabilities = Object.keys(capabilityLabels) as Capability[];
export const employeeNames = [
  "Daily Coordinator",
  "Conversation Assistant",
  "Relationship Assistant",
  "Listing Coordinator",
  "Team Coach",
] as const;
