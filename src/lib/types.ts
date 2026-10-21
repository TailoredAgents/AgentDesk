export type ActionKind =
  "summary" | "crm_note" | "message" | "task" | "listing_update";
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
};
export type Agent = {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  email: string;
  style: { tone: string; length: string; avoid: string; examples: string };
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
};
export type Conversation = {
  id: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  transcript: string;
  source: "note" | "audio" | "sample";
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
  origin: "sample" | "openai";
  createdAt: string;
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
export type WorkspaceData = {
  workspace: {
    id: string;
    name: string;
    sample: boolean;
    referenceDate: string;
  };
  agents: Agent[];
  clients: Client[];
  properties: Property[];
  tasks: Task[];
  conversations: Conversation[];
  packages: WorkPackage[];
  appointments: Appointment[];
  activities: Activity[];
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
