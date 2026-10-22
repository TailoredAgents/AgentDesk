import type { ActionChange, ClientFact } from "./intelligence-types";
import type { WorkProduct, TaskCalendarSchedule } from "./work-product-types";

export type ActionKind =
  | "summary"
  | "crm_note"
  | "message"
  | "task"
  | "listing_update"
  | "question"
  | "intelligence"
  | "task_update";
export type Decision = "pending" | "approved" | "rejected";
export type Fact = {
  text: string;
  certainty: "confirmed" | "requested" | "uncertain";
  sourceQuote: string;
};
export type ProposedAction = {
  id: string;
  kind: ActionKind;
  title: string;
  body: string;
  status: Decision;
  dueDate: string | null;
  sourceQuote: string;
  certainty: "confirmed" | "requested" | "uncertain";
  original?: { title: string; body: string; dueDate: string | null };
  originalAvailable?: boolean;
  change?: ActionChange | null;
};
export type Agent = {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  email: string;
  style: {
    tone: string;
    length: string;
    avoid: string;
    examples: string;
    directness?: string;
    greeting?: string;
    signoff?: string;
    preferredWords?: string;
  };
};
export type Client = {
  id: string;
  agentId: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  notes: string[];
};
export type Property = {
  id: string;
  agentId: string;
  clientId: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  stage: string;
  image: string;
  description: string;
  notes: string[];
  targetDate: string | null;
};
export type Task = {
  id: string;
  agentId: string;
  clientId: string | null;
  propertyId: string | null;
  title: string;
  detail: string;
  dueDate: string | null;
  status: "open" | "done";
  priority: "high" | "normal";
  source: string;
  createdAt: string;
  reviewPackageId?: string | null;
  sourceActionId?: string | null;
  calendarSchedule?: TaskCalendarSchedule | null;
};
export type Conversation = {
  id: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  transcript: string;
  source: "note" | "audio" | "sample" | "followup" | "correction";
  createdAt: string;
};
export type WorkPackage = {
  id: string;
  conversationId: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  summary: string;
  facts: Fact[];
  clarifications: string[];
  actions: ProposedAction[];
  status: "pending" | "reviewed";
  origin: "sample" | "openai" | "human";
  createdAt: string;
  requestId?: string | null;
  recommendationId?: string | null;
  signalIds?: string[];
};
export type Appointment = {
  id: string;
  agentId: string;
  clientId: string | null;
  propertyId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: "confirmed" | "tentative";
  briefing: string;
};
export type Activity = {
  id: string;
  agentId: string;
  clientId: string | null;
  propertyId: string | null;
  title: string;
  detail: string;
  kind: string;
  createdAt: string;
};
export type Commitment = {
  id: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  conversationId: string | null;
  kind: "follow_up" | "question" | "dependency";
  title: string;
  detail: string;
  dueDate: string | null;
  status: "open" | "resolved";
  sourceQuote: string;
  createdAt: string;
  resolvedAt: string | null;
  sourceActionId?: string | null;
};
export type ReviewAudit = {
  id: string;
  packageId: string;
  actionId: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  decision: "approved" | "rejected";
  original: { title: string; body: string; dueDate: string | null };
  edited: { title: string; body: string; dueDate: string | null };
  reviewedAt: string;
  actor: string;
  originalAvailable: boolean;
};
export type FollowUpRecommendation = {
  id: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  reason: string;
  urgency: "overdue" | "due" | "upcoming" | "unresolved";
  dueDate: string | null;
  taskIds: string[];
  commitmentIds: string[];
  evidence: string[];
  sourceSnapshot: string;
  packageId: string | null;
  status: "needs_draft" | "ready_for_review" | "approved_draft" | "reviewed";
  uncertainties: string[];
};
export type WorkspaceData = {
  workspace: {
    id: string;
    name: string;
    sample: boolean;
    referenceDate: string;
    revision?: number;
  };
  agents: Agent[];
  clients: Client[];
  properties: Property[];
  tasks: Task[];
  conversations: Conversation[];
  packages: WorkPackage[];
  appointments: Appointment[];
  activities: Activity[];
  commitments: Commitment[];
  recommendations: FollowUpRecommendation[];
  reviewHistory: ReviewAudit[];
  workProducts: WorkProduct[];
  clientFacts?: ClientFact[];
  capabilities: {
    ai: boolean;
    transcription: boolean;
    externalSend: false;
    crmSync: false;
  };
};
export type ReviewInput = {
  decisions: {
    id: string;
    status: "approved" | "rejected";
    body: string;
    title?: string;
    dueDate?: string | null;
  }[];
};
