export const intelligenceTopics = [
  "objective",
  "communication",
  "buyer_priority",
  "cleaning",
  "photography",
  "staging",
  "listing_launch",
] as const;
export type IntelligenceTopic = (typeof intelligenceTopics)[number];
export const topicLabels: Record<IntelligenceTopic, string> = {
  objective: "Real estate objective",
  communication: "Communication preference",
  buyer_priority: "Search priority",
  cleaning: "Cleaning",
  photography: "Photography",
  staging: "Staging",
  listing_launch: "Listing launch",
};
export type Observation = {
  topic: IntelligenceTopic;
  value: string;
  sourceQuote: string;
  certainty: "confirmed" | "requested" | "uncertain";
  effectiveDate: string | null;
  intent: "information" | "replacement";
};
export type ClientFact = {
  id: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  topic: IntelligenceTopic;
  value: string;
  sourceQuote: string;
  sourceConversationId: string;
  certainty: "confirmed" | "requested" | "uncertain" | "disputed";
  effectiveDate: string | null;
  status: "current" | "superseded" | "retired";
  recordedAt: string;
  reviewedAt: string;
  reviewer: string;
  sourceActionId: string | null;
  supersedes: string[];
  humanEdited: boolean;
};
export type IntelligenceChange = {
  type: "fact";
  observation: Observation;
  disposition: "new" | "replace" | "request" | "conflict" | "retire";
  before: ClientFact[];
  humanCorrection?: boolean;
};
export type TaskChange = {
  type: "task";
  targetId: string;
  before: {
    title: string;
    detail: string;
    dueDate: string | null;
    status: string;
    calendarSchedule?: unknown;
  };
};
export type ActionChange = IntelligenceChange | TaskChange;
export type SituationImpact = {
  id: string;
  kind: "task" | "appointment" | "message" | "document" | "commitment";
  targetId: string;
  versionId?: string;
  section?: string;
  title: string;
  detail: string;
  agentId: string;
  clientId: string;
  propertyId: string | null;
  factId: string;
  previousFactId: string;
};
