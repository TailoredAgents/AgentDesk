import type { Agent, WorkspaceData } from "../../src/lib/types";

export const warmStyle = {
  tone: "Warm, conversational, calm. Use contractions.",
  length: "Two or three short sentences.",
  directness: "Get to the practical next step immediately.",
  greeting: "Hey, followed by the first name.",
  signoff: "None for short texts.",
  preferredWords: "checking on; keep you posted",
  avoid:
    "I hope this message finds you well; exciting journey; just checking in",
  examples:
    "Hey Avery! I'm checking on that time and will keep you posted once I hear back.",
};
export const professionalStyle = {
  tone: "Professional, composed, concise. Friendly without exclamation marks.",
  length: "Three clear sentences at most.",
  directness: "State the outstanding question, then the precise next step.",
  greeting: "Hi, followed by the first name.",
  signoff: "No sign-off in a short message.",
  preferredWords: "confirm; review; next step",
  avoid:
    "I hope this message finds you well; Hey; exciting journey; just checking in",
  examples:
    "Hi Avery, I'll confirm the requested details before we decide on the next step.",
};

export function fictionalAIWorkspace(): WorkspaceData {
  const agent = (id: string, name: string, style: Agent["style"]): Agent => ({
    id,
    name,
    style,
    role: "Real estate agent",
    initials: name
      .split(" ")
      .map((part) => part[0])
      .join(""),
    color: "#64788b",
    email: `${id}@example.invalid`,
  });
  return {
    workspace: {
      id: "ai-evaluation-only",
      name: "Fictional evaluation",
      sample: true,
      referenceDate: "2026-10-23",
    },
    agents: [
      agent("eval-jordan", "Jordan Ellis", warmStyle),
      agent("eval-sophie", "Sophie Chen", professionalStyle),
    ],
    clients: [
      {
        id: "eval-sarah",
        agentId: "eval-jordan",
        name: "Sarah Mitchell",
        email: "sarah-private@example.invalid",
        phone: "555-0100",
        type: "Seller",
        notes: [
          "Prefers short text messages. Asked whether patio furniture should stay for photography.",
        ],
      },
      {
        id: "eval-michael",
        agentId: "eval-sophie",
        name: "Michael Turner",
        email: "michael-private@example.invalid",
        phone: "555-0101",
        type: "Buyer",
        notes: [
          "Prefers text over phone calls. Wants HOA costs compared before deciding.",
        ],
      },
    ],
    properties: [
      {
        id: "eval-willow",
        agentId: "eval-jordan",
        clientId: "eval-sarah",
        address: "1420 Willow Lane",
        city: "Fictional city",
        price: 875000,
        beds: 4,
        baths: 3,
        sqft: 2800,
        stage: "Preparation",
        image: "",
        description: "Fictional evaluation property",
        notes: ["Photography appointment remains unconfirmed."],
        targetDate: null,
      },
    ],
    tasks: [
      {
        id: "eval-followup",
        agentId: "eval-jordan",
        clientId: "eval-sarah",
        propertyId: "eval-willow",
        title: "Check photographer availability",
        detail:
          "Confirm requested photography time with the photographer; no confirmation is recorded.",
        dueDate: "2026-10-23",
        status: "open",
        priority: "high",
        source: "Fictional evaluation",
        createdAt: "2026-10-22T14:00:00Z",
      },
    ],
    conversations: [],
    packages: [],
    appointments: [],
    activities: [],
    commitments: [],
    recommendations: [],
    reviewHistory: [],
    workProducts: [],
    capabilities: {
      ai: false,
      transcription: false,
      externalSend: false,
      crmSync: false,
    },
  };
}

export const aiEvaluationScenarios = [
  {
    id: "seller-requested-photography",
    agentId: "eval-jordan",
    clientId: "eval-sarah",
    propertyId: "eval-willow",
    transcript:
      "Spoke with Sarah Mitchell about 1420 Willow Lane. Cleaning is booked for Monday, October 26, 2026. Sarah would like photography on Tuesday afternoon, October 27, 2026, but the photographer has not confirmed. I need to check availability, prepare and send Sarah a preparation checklist, and follow up once the time is confirmed. Sarah asked whether the patio furniture should stay for photos; that still needs a decision. The checklist has not been sent.",
  },
  {
    id: "buyer-preferences-and-separate-actions",
    agentId: "eval-sophie",
    clientId: "eval-michael",
    propertyId: null,
    transcript:
      "Spoke with Michael Turner after the property tour. His budget ceiling is $625,000. He prefers text messages rather than calls. He asked me to compare the HOA fees before deciding on an offer; we do not have the current fees yet. I said I would ask the listing agent for the current fees and send a comparison on Friday, October 23, 2026. Michael requested another tour on Thursday, October 29, 2026, but the listing agent has not confirmed it. No offer has been made.",
  },
  {
    id: "seller-incomplete-and-conflicting-dates",
    agentId: "eval-jordan",
    clientId: "eval-sarah",
    propertyId: "eval-willow",
    transcript:
      "Sarah mentioned cleaning on Monday, October 27, 2026, but is not sure the weekday or date is right. Photography might be October 28, 2026 or October 29, 2026; the dates conflict and neither appointment is confirmed. She asked if there would be an extra staging charge. I do not know the fee and did not quote a price. I said I would check the dates and ask about the fee before following up. Do not treat either date as booked.",
  },
];

export const fictionalAudioTranscript =
  "This is a fictional AgentDesk test. Sarah wants photography on Tuesday, but the photographer has not confirmed. Cleaning is booked for Monday. I need to prepare a checklist and check the photography time.";
