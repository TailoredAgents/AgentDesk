export const preferenceOptions = {
  followupLength: {
    label: "Follow-up message length",
    area: "Communication",
    values: ["concise", "standard"],
    scope: "Client follow-ups only; formal documents keep their own format.",
  },
  followupGreeting: {
    label: "Follow-up greeting",
    area: "Communication",
    values: ["none", "first_name"],
    scope: "Client follow-ups only; client-specific requests take priority.",
  },
  noteFormat: {
    label: "CRM note organization",
    area: "Administration",
    values: ["bullets", "paragraphs"],
    scope:
      "New conversation notes; recorded facts and qualifications are preserved.",
  },
  briefingDetail: {
    label: "Appointment briefing detail",
    area: "Administration",
    values: ["concise", "standard"],
    scope:
      "New appointment briefings; questions and required information remain.",
  },
  sellerPhotoChecklist: {
    label: "Seller photography checklist",
    area: "Workflow",
    values: ["include", "omit"],
    scope:
      "Seller preparation packages; optional guidance, never a confirmed client plan.",
  },
  briefingShortcut: {
    label: "Appointment preparation shortcut",
    area: "Workflow",
    values: ["show", "hide"],
    scope:
      "Show a shortcut for the next assigned appointment. Draft preparation still requires a click and review.",
  },
} as const;
export type PreferenceKey = keyof typeof preferenceOptions;
export type Values = Partial<Record<PreferenceKey, string>>;
export type Preference = {
  value: string;
  source: "configured" | "accepted_suggestion";
  updatedAt: string;
  suggestionId?: string;
};
export type Preferences = Partial<Record<PreferenceKey, Preference>>;
export type WorkstyleContext = {
  values: Values;
  mandatory: Values;
  requirements: string[];
};
export type Scope =
  | { kind: "sample"; workspaceId: string; agentId: string }
  | { kind: "pilot"; memberId: string; brokerageId: string };
export type Signals = {
  shorter?: boolean;
  greetingRemoved?: boolean;
  photoChecklistAdded?: boolean;
  briefingRequested?: boolean;
};
export type Evidence = {
  id: string;
  sourceKey: string;
  workflow: "follow_up" | "seller_preparation" | "appointment_briefing";
  contextKey: string;
  before: string;
  after: string;
  signals: Signals;
  recordedAt: string;
  fictional: boolean;
};
export type Suggestion = {
  id: string;
  rule: string;
  title: string;
  why: string;
  effect: string;
  proposed: Values;
  evidenceIds: string[];
  supporting: number;
  considered: number;
  status: string;
  createdAt: string;
};
export const PHOTO_GUIDANCE =
  "Before photography, review a room-by-room preparation checklist with the seller.";
export const REQUIRED_REVIEW =
  "Drafts require human review. External actions retain their existing authorization and approval checks.";
export const labels: Record<string, string> = {
  concise: "Concise",
  standard: "Standard detail",
  none: "No greeting",
  first_name: "First-name greeting",
  bullets: "Bullet points",
  paragraphs: "Short paragraphs",
  include: "Include",
  omit: "Do not include",
  show: "Show shortcut",
  hide: "Hide shortcut",
};
