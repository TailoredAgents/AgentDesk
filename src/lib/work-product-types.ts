export type WorkProductKind = "seller_preparation" | "appointment_briefing";
export type WorkProductSectionKind = "recorded_facts" | "general_guidance" | "open_questions" | "next_steps";
export type WorkProductContent = {
  title: string;
  introduction: string;
  sections: {
    title: string;
    kind: WorkProductSectionKind;
    items: { text: string; sourceId: string | null; sourceQuote: string | null; certainty: "confirmed" | "requested" | "uncertain" | "general" }[];
  }[];
};
export type WorkProductSource = { id: string; label: string; text: string };
export type WorkProductSnapshot = {
  workspaceName: string;
  sample: boolean;
  agent: { id: string; name: string; email: string };
  client: { id: string; name: string } | null;
  property: { id: string; address: string; city: string } | null;
  appointment: { id: string; title: string; startsAt: string; endsAt: string; location: string; status: "confirmed" | "tentative" } | null;
  sources: WorkProductSource[];
};
export type WorkProductVersion = {
  id: string;
  version: number;
  editRevision: number;
  status: "pending" | "approved" | "rejected";
  origin: "sample" | "openai";
  content: WorkProductContent;
  originalContent: WorkProductContent;
  snapshot: WorkProductSnapshot;
  createdAt: string;
  reviewedAt: string | null;
  reviewer: string | null;
  hasPdf: boolean;
  pdfSha256: string | null;
  history: {
    id: string;
    event: "created" | "edited" | "approved" | "rejected";
    editRevision: number;
    content: WorkProductContent;
    actor: string;
    createdAt: string;
  }[];
};
export type WorkProduct = {
  id: string;
  kind: WorkProductKind;
  agentId: string;
  clientId: string | null;
  propertyId: string | null;
  appointmentId: string | null;
  sourceConversationId: string | null;
  sourcePackageId: string | null;
  createdAt: string;
  versions: WorkProductVersion[];
};
export type TaskCalendarSchedule = {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  confirmedAt: string;
  confirmedBy: string;
};
