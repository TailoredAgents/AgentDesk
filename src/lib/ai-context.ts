import { currentContextText, currentFacts } from "./intelligence";
import { effectiveMessageStyle } from "./workstyle/engine";
import type { ClientFact } from "./intelligence-types";
import { ApiError } from "./auth";
import type { Agent, Client, Property, WorkspaceData } from "./types";

export type AIContext = {
  workflow?: "conversation" | "follow_up";
  agent: Agent;
  client: Client;
  property: Property | null;
  transcript: string;
  approvedMessages: string[];
  referenceDate?: string;
  obsoleteFacts?: ClientFact[];
  relationship?: {
    reviewedIntelligence?: ClientFact[];
    clientNotes: string[];
    propertyNotes: string[];
    tasks: {
      title: string;
      detail: string;
      status: string;
      dueDate: string | null;
    }[];
    commitments: {
      kind: string;
      title: string;
      detail: string;
      status: string;
      dueDate: string | null;
      sourceQuote: string;
    }[];
    appointments: {
      title: string;
      startsAt: string;
      status: string;
      briefing: string;
    }[];
    conversations: { title: string; createdAt: string; transcript: string }[];
  };
};

/** Authorised workspace context stays within one human agent and client relationship. */
export function buildAIContext(
  data: WorkspaceData,
  agentId: string,
  clientId: string,
  propertyId: string | null,
  transcript: string,
): AIContext {
  const agent = data.agents.find((item) => item.id === agentId);
  const client = data.clients.find(
    (item) => item.id === clientId && item.agentId === agentId,
  );
  const property = propertyId
    ? data.properties.find(
        (item) =>
          item.id === propertyId &&
          item.agentId === agentId &&
          item.clientId === clientId,
      )
    : null;
  if (!agent || !client || (propertyId && !property)) {
    throw new ApiError(
      400,
      "Choose a client and property assigned to this agent.",
      "invalid_relationship",
    );
  }
  const matches = (item: {
    agentId: string;
    clientId: string | null;
    propertyId: string | null;
  }) =>
    item.agentId === agentId &&
    item.clientId === clientId &&
    (!item.propertyId || item.propertyId === propertyId);
  const memory = (data.clientFacts ?? []).filter(matches);
  const current = (text: string) => currentContextText(text, memory);
  return {
    agent,
    client,
    property: property ?? null,
    transcript,
    obsoleteFacts: memory.filter((f) => f.status !== "current"),
    referenceDate: data.workspace.referenceDate,
    approvedMessages: data.packages
      .filter(matches)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((item) =>
        item.actions
          .filter(
            (action) =>
              action.kind === "message" && action.status === "approved",
          )
          .map((action) => current(action.body))
          .filter(Boolean),
      )
      .slice(0, 3),
    relationship: {
      reviewedIntelligence: currentFacts(data, {
        agentId,
        clientId,
        propertyId,
      }).slice(0, 24),
      clientNotes: client.notes
        .slice(-5)
        .map((note) => current(note).slice(0, 1600)),
      propertyNotes: (property?.notes ?? [])
        .slice(-4)
        .map((note) => current(note).slice(0, 1200)),
      tasks: data.tasks
        .filter(matches)
        .slice(-20)
        .map(({ title, detail, status, dueDate }) => ({
          title: current(title) || "Recorded task — earlier wording omitted",
          detail: current(detail).slice(0, 1200),
          status,
          dueDate,
        })),
      commitments: data.commitments
        .filter(matches)
        .slice(-20)
        .map(({ kind, title, detail, status, dueDate, sourceQuote }) => ({
          kind,
          title:
            current(title) || "Recorded commitment — earlier wording omitted",
          detail: current(detail).slice(0, 1200),
          status,
          dueDate,
          sourceQuote: current(sourceQuote).slice(0, 1200),
        })),
      appointments: data.appointments
        .filter(matches)
        .slice(-8)
        .map(({ title, startsAt, status, briefing }) => ({
          title:
            current(title) || "Recorded appointment — earlier wording omitted",
          startsAt,
          status,
          briefing: current(briefing).slice(0, 1000),
        })),
      conversations: data.conversations
        .filter((item) => matches(item) && item.transcript !== transcript)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
        .map(({ title, createdAt, transcript: previous }) => ({
          title:
            current(title) || "Recorded conversation — earlier wording omitted",
          createdAt,
          transcript: current(previous).slice(0, 2200),
        })),
    },
  };
}

/** Only this minimised payload crosses the provider boundary; no email or phone fields. */
export function buildProviderContext(context: AIContext) {
  return {
    agent: {
      name: context.agent.name,
      communicationStyle: {
        ...effectiveMessageStyle(
          context.agent.style,
          context.agent.workstyle,
          context.workflow || "conversation",
        ),
        examples: currentContextText(
          context.agent.style.examples,
          context.obsoleteFacts ?? [],
        ),
      },
    },
    client: { name: context.client.name, relationship: context.client.type },
    property: context.property
      ? { address: context.property.address, stage: context.property.stage }
      : null,
    referenceDate: context.referenceDate ?? null,
    authorisedRelationshipContext: context.relationship ?? null,
    approvedWritingExamples: context.approvedMessages
      .slice(0, 3)
      .map((message) => message.slice(0, 1500)),
    source: context.transcript,
    approvedWorkstyle: {
      noteFormat: context.agent.workstyle?.values.noteFormat ?? null,
      mandatoryBrokerageStandards: context.agent.workstyle?.requirements ?? [],
      scope: context.workflow || "conversation",
      rule: "Formatting preferences are not client facts. Client-specific communication requests and mandatory brokerage standards take priority. No preference authorizes a new action.",
    },
  };
}
