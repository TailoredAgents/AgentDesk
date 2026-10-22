import type { Observation, ClientFact } from "./intelligence-types";

export const baselineStatements: Observation[] = [
  {
    topic: "objective",
    value: "Sarah is preparing to sell 1420 Willow Lane.",
    sourceQuote: "Sarah is preparing to sell 1420 Willow Lane.",
    certainty: "confirmed",
    effectiveDate: null,
    intent: "information",
  },
  {
    topic: "communication",
    value: "Sarah said she prefers short, straightforward text updates.",
    sourceQuote: "Sarah said she prefers short, straightforward text updates.",
    certainty: "confirmed",
    effectiveDate: null,
    intent: "information",
  },
  {
    topic: "cleaning",
    value: "Cleaning is confirmed for Monday, October 26, 2026.",
    sourceQuote: "Cleaning is confirmed for Monday, October 26, 2026.",
    certainty: "confirmed",
    effectiveDate: "2026-10-26",
    intent: "information",
  },
  {
    topic: "photography",
    value:
      "Photography is requested for Tuesday afternoon, October 27, 2026, but is not confirmed.",
    sourceQuote:
      "Photography is requested for Tuesday afternoon, October 27, 2026, but is not confirmed.",
    certainty: "requested",
    effectiveDate: "2026-10-27",
    intent: "information",
  },
];
export const situationSampleTranscript =
  "I just talked to Sarah again about 1420 Willow Lane. The cleaner had to reschedule, and cleaning is now confirmed for Wednesday, October 28, 2026. Tuesday won't work for pictures anymore. Sarah would prefer photography on Thursday afternoon, October 29, 2026, instead, but we still need to confirm with the photographer. She also still needs an answer about the patio furniture.";
export const situationSampleObservations: Observation[] = [
  {
    topic: "cleaning",
    value: "cleaning is now confirmed for Wednesday, October 28, 2026.",
    sourceQuote:
      "The cleaner had to reschedule, and cleaning is now confirmed for Wednesday, October 28, 2026.",
    certainty: "confirmed",
    effectiveDate: "2026-10-28",
    intent: "replacement",
  },
  {
    topic: "photography",
    value:
      "Sarah would prefer photography on Thursday afternoon, October 29, 2026, instead, but we still need to confirm with the photographer.",
    sourceQuote:
      "Tuesday won't work for pictures anymore. Sarah would prefer photography on Thursday afternoon, October 29, 2026, instead, but we still need to confirm with the photographer.",
    certainty: "requested",
    effectiveDate: "2026-10-29",
    intent: "replacement",
  },
];
export function sampleIntelligenceFacts(): ClientFact[] {
  return baselineStatements.map((o) => ({
    id: `sample-fact-sarah-${o.topic}`,
    agentId: "jordan",
    clientId: "sarah",
    propertyId: o.topic === "communication" ? null : "willow",
    topic: o.topic,
    value: o.value,
    sourceQuote: o.sourceQuote,
    sourceConversationId: "conversation-sarah-reviewed-baseline",
    certainty: o.certainty,
    effectiveDate: o.effectiveDate,
    status: "current",
    recordedAt: "2026-10-21T14:00:00.000Z",
    reviewedAt: "2026-10-21T14:05:00.000Z",
    reviewer: "Saved fictional example of reviewed information",
    sourceActionId: null,
    supersedes: [],
    humanEdited: false,
  }));
}
