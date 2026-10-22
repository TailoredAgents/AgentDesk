import type {
  Agent,
  Appointment,
  Client,
  Conversation,
  Fact,
  Property,
  ProposedAction,
  Task,
  WorkPackage,
  Commitment,
} from "../types";
import { recommendationIdFor } from "../follow-ups";

export const SAMPLE_WORKSPACE_ID = "willow-collective";
export const sampleWorkspace = {
  id: SAMPLE_WORKSPACE_ID,
  name: "The Willow Collective",
  sample: true,
  referenceDate: "2026-10-23",
};
const naturalStyle: Agent["style"] = {
  tone: "Warm, direct, and conversational. Use first names and contractions.",
  length: "Short: usually 2–4 sentences.",
  avoid:
    "I hope this finds you well; just checking in; exciting journey; excessive exclamation marks.",
  examples:
    "Hey Sarah! Great talking today. I’m checking on that photography time for Tuesday and will let you know as soon as it’s confirmed.",
  directness: "Lead with the specific next step; ask one clear question.",
  greeting: "Hey [first name] for established clients.",
  signoff: "Usually omit a sign-off in a short text.",
  preferredWords: "take a look; next step; let me know; work through",
};
export const sampleAgents: Agent[] = [
  {
    id: "jordan",
    name: "Jordan Ellis",
    role: "Senior agent",
    initials: "JE",
    color: "#64788b",
    email: "jordan@example.com",
    style: naturalStyle,
  },
  {
    id: "olivia",
    name: "Olivia Bennett",
    role: "Team lead",
    initials: "OB",
    color: "#957a66",
    email: "olivia@example.com",
    style: { ...naturalStyle, tone: "Thoughtful, confident, and warm." },
  },
  {
    id: "marcus",
    name: "Marcus Reed",
    role: "Listing specialist",
    initials: "MR",
    color: "#657e6d",
    email: "marcus@example.com",
    style: {
      ...naturalStyle,
      tone: "Friendly and practical; get to the next step quickly.",
    },
  },
  {
    id: "sophie",
    name: "Sophie Chen",
    role: "Buyer specialist",
    initials: "SC",
    color: "#8b7d9d",
    email: "sophie@example.com",
    style: { ...naturalStyle, tone: "Patient, clear, and reassuring." },
  },
  {
    id: "daniel",
    name: "Daniel Brooks",
    role: "Associate agent",
    initials: "DB",
    color: "#9d8467",
    email: "daniel@example.com",
    style: { ...naturalStyle, tone: "Approachable and concise." },
  },
  {
    id: "maya",
    name: "Maya Patel",
    role: "Luxury advisor",
    initials: "MP",
    color: "#69858a",
    email: "maya@example.com",
    style: { ...naturalStyle, tone: "Refined, personal, and understated." },
  },
];
export const sampleClients: Client[] = [
  {
    id: "sarah",
    agentId: "jordan",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@example.com",
    phone: "(512) 555-0101",
    type: "Seller",
    notes: [
      "Prefers concise texts for scheduling. Wants to review the preparation checklist before the weekend.",
      "Cleaning booked for Monday, October 26. Tuesday afternoon photography is requested, not confirmed.",
    ],
  },
  {
    id: "parkers",
    agentId: "jordan",
    name: "Alex & Jamie Parker",
    email: "parker.family@example.com",
    phone: "(512) 555-0102",
    type: "Buyer",
    notes: [
      "Looking for a bright home with a dedicated office. Wednesday consultation confirmed.",
    ],
  },
  {
    id: "robert",
    agentId: "olivia",
    name: "Robert Hayes",
    email: "robert.hayes@example.com",
    phone: "(512) 555-0103",
    type: "Seller",
    notes: [
      "Oak Ridge listing photography is complete. Needs final brochure review.",
    ],
  },
  {
    id: "emily",
    agentId: "marcus",
    name: "Emily Carter",
    email: "emily.carter@example.com",
    phone: "(512) 555-0104",
    type: "Seller",
    notes: ["Cedar property is active. Requested a weekly showing recap."],
  },
  {
    id: "noah",
    agentId: "sophie",
    name: "Noah Williams",
    email: "noah.williams@example.com",
    phone: "(512) 555-0105",
    type: "Buyer",
    notes: [
      "Comparing options in South Austin. Lender introduction completed.",
    ],
  },
  {
    id: "ava",
    agentId: "daniel",
    name: "Ava Thompson",
    email: "ava.thompson@example.com",
    phone: "(512) 555-0106",
    type: "Buyer",
    notes: [
      "Relocating in November. Virtual consultation booked for Thursday.",
    ],
  },
  {
    id: "grace",
    agentId: "maya",
    name: "Grace Foster",
    email: "grace.foster@example.com",
    phone: "(512) 555-0107",
    type: "Seller",
    notes: [
      "Lakehaven waterfront home is preparing for launch. Staging proposal awaiting client approval.",
    ],
  },
];
export const sampleProperties: Property[] = [
  {
    id: "willow",
    agentId: "jordan",
    clientId: "sarah",
    address: "1420 Willow Lane",
    city: "Austin, TX 78704",
    price: 895000,
    beds: 3,
    baths: 2,
    sqft: 2180,
    stage: "Preparing to list",
    image: "/images/willow.jpg",
    description:
      "A contemporary single-story home with warm natural finishes, an inviting covered entry, and an open, light-filled layout.",
    notes: [
      "Cleaning confirmed for Monday, October 26.",
      "Photography requested for Tuesday, October 27, afternoon. Photographer confirmation outstanding.",
    ],
    targetDate: null,
  },
  {
    id: "oak",
    agentId: "olivia",
    clientId: "robert",
    address: "608 Oak Ridge Drive",
    city: "Austin, TX 78746",
    price: 1245000,
    beds: 4,
    baths: 3,
    sqft: 3120,
    stage: "Ready to launch",
    image: "/images/oak.jpg",
    description:
      "A refined farmhouse-inspired residence with crisp white board-and-batten, brick detailing, and a generous front lawn.",
    notes: [
      "Photography complete. Brochure and launch copy are awaiting final review.",
    ],
    targetDate: "2026-10-23",
  },
  {
    id: "cedar",
    agentId: "marcus",
    clientId: "emily",
    address: "321 Cedar Hollow",
    city: "Austin, TX 78739",
    price: 735000,
    beds: 4,
    baths: 3,
    sqft: 2640,
    stage: "Active listing",
    image: "/images/cedar.jpg",
    description:
      "A traditional two-story home framed by mature trees, with generous living spaces and an established neighborhood setting.",
    notes: ["Active since October 14. Weekly showing recap due Wednesday."],
    targetDate: "2026-10-14",
  },
  {
    id: "lake",
    agentId: "maya",
    clientId: "grace",
    address: "94 Lakehaven Terrace",
    city: "Austin, TX 78734",
    price: 2180000,
    beds: 5,
    baths: 4,
    sqft: 4210,
    stage: "Preparing to list",
    image: "/images/lake.jpg",
    description:
      "A spacious waterfront residence with private dock access and indoor-outdoor spaces oriented toward the water.",
    notes: [
      "Staging proposal sent for client review. Launch date remains undecided.",
    ],
    targetDate: null,
  },
];
const task = (
  id: string,
  agentId: string,
  clientId: string | null,
  propertyId: string | null,
  title: string,
  detail: string,
  dueDate: string,
  status: "open" | "done" = "open",
  priority: "high" | "normal" = "normal",
): Task => ({
  id,
  agentId,
  clientId,
  propertyId,
  title,
  detail,
  dueDate,
  status,
  priority,
  source: "Sample workspace",
  createdAt: "2026-10-20T14:00:00.000Z",
});
export const sampleTasks: Task[] = [
  task(
    "task-sarah-review",
    "jordan",
    "sarah",
    "willow",
    "Review Sarah’s seller follow-up",
    "A saved sample work package is ready. Confirm wording and review the unconfirmed photography request.",
    "2026-10-21",
    "open",
    "high",
  ),
  task(
    "task-willow-disclosure",
    "jordan",
    "sarah",
    "willow",
    "Check the seller disclosure packet",
    "Review Sarah’s completed pages and flag any unanswered items.",
    "2026-10-21",
    "open",
    "high",
  ),
  task(
    "task-parker-brief",
    "jordan",
    "parkers",
    null,
    "Prepare the Parkers’ buyer consultation",
    "Bring neighborhood options and questions about their home-office needs.",
    "2026-10-21",
  ),
  task(
    "task-willow-cleaning",
    "jordan",
    "sarah",
    "willow",
    "Confirm the cleaning appointment",
    "Sarah confirmed cleaning is booked for Monday, October 26.",
    "2026-10-20",
    "done",
  ),
  task(
    "task-willow-walkthrough",
    "jordan",
    "sarah",
    "willow",
    "Complete the pre-listing walkthrough",
    "Initial walkthrough completed with Sarah. Preparation notes recorded.",
    "2026-10-19",
    "done",
  ),
  task(
    "task-willow-staging",
    "jordan",
    "sarah",
    "willow",
    "Review room-by-room staging notes",
    "Check recommendations before including them in Sarah’s preparation checklist.",
    "2026-10-22",
  ),
  task(
    "task-oak-brochure",
    "olivia",
    "robert",
    "oak",
    "Approve the Oak Ridge brochure",
    "Photography is complete; final property copy is ready for review.",
    "2026-10-21",
    "open",
    "high",
  ),
  task(
    "task-oak-photos",
    "olivia",
    "robert",
    "oak",
    "Review delivered photography",
    "Selected property photos approved by Robert.",
    "2026-10-20",
    "done",
  ),
  task(
    "task-coaching",
    "olivia",
    null,
    null,
    "Check in on listing bottlenecks",
    "Help Jordan confirm photography and Maya resolve staging approval.",
    "2026-10-22",
  ),
  task(
    "task-cedar-recap",
    "marcus",
    "emily",
    "cedar",
    "Review Emily’s showing recap",
    "A saved sample Relationship Assistant draft is awaiting review.",
    "2026-10-21",
    "open",
    "high",
  ),
  task(
    "task-cedar-sign",
    "marcus",
    "emily",
    "cedar",
    "Check listing signage",
    "Signage and access instructions verified.",
    "2026-10-19",
    "done",
  ),
  task(
    "task-noah-options",
    "sophie",
    "noah",
    null,
    "Share Noah’s neighborhood shortlist",
    "Compare commute priorities from the buyer consultation.",
    "2026-10-21",
  ),
  task(
    "task-noah-lender",
    "sophie",
    "noah",
    null,
    "Make the lender introduction",
    "Introduction completed and acknowledged by Noah.",
    "2026-10-20",
    "done",
  ),
  task(
    "task-ava-relocation",
    "daniel",
    "ava",
    null,
    "Prepare Ava’s relocation call",
    "Gather questions for Thursday’s virtual consultation.",
    "2026-10-22",
  ),
  task(
    "task-ava-prefs",
    "daniel",
    "ava",
    null,
    "Capture Ava’s home preferences",
    "Initial preferences saved to the client record.",
    "2026-10-20",
    "done",
  ),
  task(
    "task-lake-staging",
    "maya",
    "grace",
    "lake",
    "Follow up on staging approval",
    "Grace’s decision is needed before a photography date can be proposed.",
    "2026-10-20",
    "open",
    "high",
  ),
  task(
    "task-lake-walkthrough",
    "maya",
    "grace",
    "lake",
    "Complete the waterfront walkthrough",
    "Property access and preparation needs documented.",
    "2026-10-19",
    "done",
  ),
];
export const sampleConversations: Conversation[] = [
  {
    id: "conversation-sarah",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    title: "Sarah’s listing preparation",
    transcript:
      "Spoke with Sarah Mitchell today, Wednesday October 21, about preparing 1420 Willow Lane for sale. Sarah said: “The cleaners are booked for Monday, October 26.” She would like photography next Tuesday afternoon, October 27, but the photographer has not confirmed a time. Sarah said: “Tuesday afternoon would work best for photos, if the photographer can do it.” I told her I would check with the photographer and let her know once we have a confirmed time. I also need to send Sarah the preparation checklist before the weekend and follow up with her. We have not agreed on a listing launch date.",
    source: "sample",
    createdAt: "2026-10-21T13:42:00.000Z",
  },
  {
    id: "conversation-emily",
    agentId: "marcus",
    clientId: "emily",
    propertyId: "cedar",
    title: "Emily’s weekly showing update",
    transcript:
      "Emily Carter asked for a short update on the Cedar Hollow listing. She said: “A quick recap each Wednesday would be helpful.” I said I would review the available showing feedback and prepare an update. We did not discuss a price change or receive an offer.",
    source: "sample",
    createdAt: "2026-10-21T13:10:00.000Z",
  },
  {
    id: "conversation-grace",
    agentId: "maya",
    clientId: "grace",
    propertyId: "lake",
    title: "Grace’s staging decision",
    transcript:
      "Grace Foster is still reviewing the staging proposal for 94 Lakehaven Terrace. She said: “I need a little more time to look at the proposal.” I need to follow up with her before arranging photography. No staging vendor or photography date has been approved.",
    source: "sample",
    createdAt: "2026-10-20T18:30:00.000Z",
  },
];
const action = (
  id: string,
  kind: ProposedAction["kind"],
  title: string,
  body: string,
  sourceQuote: string,
  certainty: Fact["certainty"] = "confirmed",
  dueDate: string | null = null,
): ProposedAction => ({
  id,
  kind,
  title,
  body,
  sourceQuote,
  certainty,
  dueDate,
  status: "pending",
});
export const legacySarahTranscript = sampleConversations.find(
  (item) => item.id === "conversation-sarah",
)!.transcript;
sampleConversations.find(
  (item) => item.id === "conversation-sarah",
)!.transcript +=
  " Sarah also asked: “Should I leave the patio furniture out for the photos?” We have not resolved that question.";
const sarahSummary =
  "Sarah is preparing 1420 Willow Lane for sale. Cleaning is booked for Monday, October 26. She requested photography for Tuesday afternoon, October 27; the photographer has not confirmed. Jordan will check availability, share the preparation checklist before the weekend, and follow up. A launch date has not been agreed.";
export const samplePackages: WorkPackage[] = [
  {
    id: "package-sarah",
    conversationId: "conversation-sarah",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    title: "A thoughtful follow-up for Sarah",
    summary: sarahSummary,
    facts: [
      {
        text: "Cleaning is booked for Monday, October 26.",
        certainty: "confirmed",
        sourceQuote: "The cleaners are booked for Monday, October 26.",
      },
      {
        text: "Sarah prefers Tuesday afternoon, October 27, for photography.",
        certainty: "requested",
        sourceQuote:
          "Tuesday afternoon would work best for photos, if the photographer can do it.",
      },
      {
        text: "The photography time is awaiting confirmation.",
        certainty: "uncertain",
        sourceQuote: "the photographer has not confirmed a time",
      },
      {
        text: "Jordan will send the preparation checklist before the weekend.",
        certainty: "confirmed",
        sourceQuote:
          "I also need to send Sarah the preparation checklist before the weekend",
      },
    ],
    clarifications: [
      "Confirm the photographer’s availability before adding a photography appointment.",
      "Agree on a launch date after the preparation schedule is confirmed.",
    ],
    actions: [
      action(
        "sarah-summary",
        "summary",
        "Save the conversation summary",
        sarahSummary,
        "Spoke with Sarah Mitchell today, Wednesday October 21, about preparing 1420 Willow Lane for sale.",
      ),
      action(
        "sarah-note",
        "crm_note",
        "Update Sarah’s client notes",
        "Listing preparation: cleaning booked for October 26. Photography requested for October 27 afternoon, awaiting photographer confirmation. Send preparation checklist before the weekend and follow up. No launch date agreed.",
        "We have not agreed on a listing launch date.",
      ),
      action(
        "sarah-message",
        "message",
        "A follow-up in your voice",
        "Hey Sarah! Great talking today. I’m checking on Tuesday afternoon for photos and will let you know as soon as the photographer confirms. With cleaning booked for Monday, I’ll get the prep checklist over to you before the weekend so you have time to work through it. We’ll settle on a launch date once the timing is in place.",
        "I told her I would check with the photographer and let her know once we have a confirmed time.",
      ),
      action(
        "sarah-photographer",
        "task",
        "Confirm Tuesday photography availability",
        "Ask the photographer whether Tuesday, October 27, afternoon is available for 1420 Willow Lane. Confirm the time with Sarah only after the photographer responds.",
        "Tuesday afternoon would work best for photos, if the photographer can do it.",
        "requested",
        "2026-10-22",
      ),
      action(
        "sarah-checklist",
        "task",
        "Send Sarah the preparation checklist",
        "Prepare and share the listing preparation checklist before the weekend. No checklist has been sent or attached by AgentDesk.",
        "I also need to send Sarah the preparation checklist before the weekend",
        "confirmed",
        "2026-10-23",
      ),
      action(
        "sarah-listing",
        "listing_update",
        "Update the listing preparation notes",
        "Cleaning booked for Monday, October 26. Photography requested for Tuesday afternoon, October 27, pending confirmation. Launch date undecided.",
        "The cleaners are booked for Monday, October 26.",
      ),
      action(
        "sarah-patio-question",
        "question",
        "Resolve Sarah’s patio furniture question",
        "Sarah asked whether to leave the patio furniture out for the photos. Confirm the preparation recommendation with her; no answer is recorded yet.",
        "Should I leave the patio furniture out for the photos?",
        "uncertain",
      ),
    ],
    status: "pending",
    origin: "sample",
    createdAt: "2026-10-21T13:45:00.000Z",
  },
  {
    id: "package-emily",
    conversationId: "conversation-emily",
    agentId: "marcus",
    clientId: "emily",
    propertyId: "cedar",
    title: "Emily’s weekly listing check-in",
    summary:
      "Emily requested a concise Wednesday showing recap. Marcus will review feedback before sharing an update. No price change or offer was discussed.",
    facts: [
      {
        text: "Emily prefers a Wednesday recap.",
        certainty: "requested",
        sourceQuote: "A quick recap each Wednesday would be helpful.",
      },
    ],
    clarifications: [
      "Review the actual showing feedback before adding any performance claims.",
    ],
    actions: [
      action(
        "emily-message",
        "message",
        "Prepare Emily’s Wednesday update",
        "Hey Emily, I’m pulling together the feedback on Cedar Hollow and will follow up with a short recap. I’ll keep it focused on the useful takeaways and any next steps.",
        "I said I would review the available showing feedback and prepare an update.",
      ),
      action(
        "emily-note",
        "crm_note",
        "Save Emily’s communication preference",
        "Prefers a concise listing update each Wednesday. No price adjustment was discussed.",
        "A quick recap each Wednesday would be helpful.",
        "requested",
      ),
    ],
    status: "pending",
    origin: "sample",
    createdAt: "2026-10-21T13:13:00.000Z",
  },
  {
    id: "package-grace",
    conversationId: "conversation-grace",
    agentId: "maya",
    clientId: "grace",
    propertyId: "lake",
    title: "Keep Grace’s launch moving",
    summary:
      "Grace is reviewing the staging proposal. Follow up before booking photography; no vendor or appointment has been approved.",
    facts: [
      {
        text: "Staging approval is still outstanding.",
        certainty: "confirmed",
        sourceQuote: "I need a little more time to look at the proposal.",
      },
    ],
    clarifications: [
      "Ask Grace when she expects to decide; do not set a photography date yet.",
    ],
    actions: [
      action(
        "grace-message",
        "message",
        "Prepare a staging follow-up",
        "Hi Grace, take the time you need with the staging proposal. If any part would be helpful to talk through, I’m happy to help. Once you’re comfortable with the plan, we can look at photography dates.",
        "I need a little more time to look at the proposal.",
      ),
      action(
        "grace-listing",
        "listing_update",
        "Record the staging dependency",
        "Staging proposal awaiting Grace’s decision. Photography scheduling depends on staging approval; no date confirmed.",
        "No staging vendor or photography date has been approved.",
      ),
    ],
    status: "pending",
    origin: "sample",
    createdAt: "2026-10-20T18:33:00.000Z",
  },
];
export const sampleAppointments: Appointment[] = [
  {
    id: "appointment-jordan-team",
    agentId: "jordan",
    clientId: null,
    propertyId: null,
    title: "Weekly team huddle",
    startsAt: "2026-10-21T09:30:00-05:00",
    endsAt: "2026-10-21T10:00:00-05:00",
    location: "The Willow Collective · office",
    status: "confirmed",
    briefing:
      "Bring the Willow Lane photography request and any preparation blockers to the team.",
  },
  {
    id: "appointment-jordan-sarah",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    title: "Seller preparation check-in",
    startsAt: "2026-10-21T11:00:00-05:00",
    endsAt: "2026-10-21T11:20:00-05:00",
    location: "Phone call · Sarah Mitchell",
    status: "confirmed",
    briefing:
      "Cleaning is booked for Monday. Tuesday photography remains a request. Review the checklist and disclosure packet.",
  },
  {
    id: "appointment-jordan-parkers",
    agentId: "jordan",
    clientId: "parkers",
    propertyId: null,
    title: "Buyer consultation · The Parkers",
    startsAt: "2026-10-21T14:30:00-05:00",
    endsAt: "2026-10-21T15:15:00-05:00",
    location: "The Willow Collective · lounge",
    status: "confirmed",
    briefing:
      "Alex and Jamie want a bright home with an office. Confirm their timeline and priorities before suggesting properties.",
  },
  {
    id: "appointment-olivia-robert",
    agentId: "olivia",
    clientId: "robert",
    propertyId: "oak",
    title: "Oak Ridge launch review",
    startsAt: "2026-10-21T13:00:00-05:00",
    endsAt: "2026-10-21T13:30:00-05:00",
    location: "Video call · Robert Hayes",
    status: "confirmed",
    briefing:
      "Review the approved photography and final brochure. Target launch is October 23.",
  },
  {
    id: "appointment-sophie-noah",
    agentId: "sophie",
    clientId: "noah",
    propertyId: null,
    title: "Neighborhood shortlist · Noah",
    startsAt: "2026-10-21T15:00:00-05:00",
    endsAt: "2026-10-21T15:30:00-05:00",
    location: "Phone call",
    status: "confirmed",
    briefing: "Compare South Austin options and commute preferences.",
  },
  {
    id: "appointment-daniel-ava",
    agentId: "daniel",
    clientId: "ava",
    propertyId: null,
    title: "Ava’s relocation consultation",
    startsAt: "2026-10-22T10:00:00-05:00",
    endsAt: "2026-10-22T10:45:00-05:00",
    location: "Video call",
    status: "confirmed",
    briefing: "Discuss November relocation timing and housing preferences.",
  },
];

// Presentation fixtures are explicit fictional CRM records, evaluated on Friday, October 23.
sampleClients.push({
  id: "michael",
  agentId: "jordan",
  name: "Michael Turner",
  email: "michael.turner@example.com",
  phone: "(512) 555-0108",
  type: "Buyer",
  notes: [
    "Active buyer. Prefers short texts and a direct question about the homes he toured.",
    "Toured two homes with Jordan on October 21. Jordan committed to follow up on October 22; no completed follow-up is recorded.",
  ],
});
sampleConversations.push(
  {
    id: "conversation-michael-tour",
    agentId: "jordan",
    clientId: "michael",
    propertyId: null,
    title: "Michael’s buyer tour",
    transcript:
      "On Wednesday, October 21, Jordan toured two homes with Michael Turner. Michael said: “The second home’s office worked better for me, but I need to think about the commute.” Jordan said: “I’ll follow up on Thursday, October 22, to hear what you think.” No offer, decision, or additional appointment was agreed.",
    source: "sample",
    createdAt: "2026-10-21T20:30:00.000Z",
  },
  {
    id: "conversation-sarah-commitment",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    title: "Sarah’s photography follow-up commitment",
    transcript:
      "On Thursday, October 22, Sarah asked whether Tuesday afternoon photography had been confirmed. It had not. Jordan said: “I’ll check with the photographer and update you by Friday, October 23.” Cleaning remains booked for Monday, October 26. No photography time or listing launch date was confirmed.",
    source: "sample",
    createdAt: "2026-10-22T16:00:00.000Z",
  },
  {
    id: "conversation-emily-question",
    agentId: "marcus",
    clientId: "emily",
    propertyId: "cedar",
    title: "Emily’s showing preparation question",
    transcript:
      "On Thursday, October 22, Emily Carter asked about preparing 321 Cedar Hollow for future showings: “Should I leave the patio furniture out for the next showing?” Marcus recorded the question but has not answered it yet. No showing date or preparation decision was confirmed.",
    source: "sample",
    createdAt: "2026-10-22T18:00:00.000Z",
  },
);
sampleTasks.push(
  task(
    "task-michael-followup",
    "jordan",
    "michael",
    null,
    "Follow up with Michael after the tour",
    "Jordan committed to ask Michael for his feedback on Thursday, October 22. The office layout and commute are his unresolved considerations. No completed follow-up is recorded.",
    "2026-10-22",
    "open",
    "high",
  ),
);
export const sampleCommitments: Commitment[] = [
  {
    id: "commitment-sarah-photography",
    agentId: "jordan",
    clientId: "sarah",
    propertyId: "willow",
    conversationId: "conversation-sarah-commitment",
    kind: "dependency",
    title: "Update Sarah on photography confirmation",
    detail:
      "Tuesday afternoon, October 27, is requested. Photographer confirmation is outstanding; Jordan committed to update Sarah on Friday, October 23.",
    dueDate: "2026-10-23",
    status: "open",
    sourceQuote:
      "I’ll check with the photographer and update you by Friday, October 23.",
    createdAt: "2026-10-22T16:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: "commitment-emily-question",
    agentId: "marcus",
    clientId: "emily",
    propertyId: "cedar",
    conversationId: "conversation-emily-question",
    kind: "question",
    title: "Answer Emily’s patio furniture question",
    detail:
      "Emily asked whether to leave the patio furniture out for the next showing. No answer, decision, or deadline has been recorded.",
    dueDate: null,
    status: "open",
    sourceQuote: "Should I leave the patio furniture out for the next showing?",
    createdAt: "2026-10-22T18:00:00.000Z",
    resolvedAt: null,
  },
];
samplePackages.find((item) => item.id === "package-sarah")!.signalIds = [
  "commitment:commitment-sarah-photography",
];
samplePackages.find((item) => item.id === "package-sarah")!.recommendationId =
  recommendationIdFor("jordan", "sarah", "willow", [
    "commitment:commitment-sarah-photography",
  ]);
samplePackages.push(
  {
    id: "package-michael-followup",
    conversationId: "conversation-michael-tour",
    agentId: "jordan",
    clientId: "michael",
    propertyId: null,
    title: "Pick up the conversation with Michael",
    summary:
      "Jordan’s promised October 22 follow-up after Michael’s buyer tour is still open. Ask for his thoughts on the office layout and commute. No buying decision has been recorded.",
    facts: [
      {
        text: "Jordan committed to follow up on October 22.",
        certainty: "confirmed",
        sourceQuote:
          "I’ll follow up on Thursday, October 22, to hear what you think.",
      },
    ],
    clarifications: [
      "Michael’s decision remains unknown. Approval of this draft does not complete the overdue follow-up task.",
    ],
    actions: [
      action(
        "michael-message",
        "message",
        "A buyer follow-up in Jordan’s voice",
        "Hey Michael, what are your thoughts after the tour? You mentioned the office in the second home worked better for you, and you were still weighing the commute. I’d like to hear where you landed on those two things.",
        "The second home’s office worked better for me, but I need to think about the commute.",
      ),
    ],
    status: "pending",
    origin: "sample",
    createdAt: "2026-10-23T13:30:00.000Z",
    recommendationId: recommendationIdFor("jordan", "michael", null),
  },
  {
    id: "package-emily-question",
    conversationId: "conversation-emily-question",
    agentId: "marcus",
    clientId: "emily",
    propertyId: "cedar",
    title: "Acknowledge Emily’s open question",
    summary:
      "Emily’s patio furniture question has not been resolved. Prepare an honest acknowledgment without inventing a recommendation or showing date.",
    facts: [
      {
        text: "Emily asked whether the patio furniture should stay out.",
        certainty: "confirmed",
        sourceQuote:
          "Should I leave the patio furniture out for the next showing?",
      },
    ],
    clarifications: [
      "Confirm the preparation advice before marking Emily’s question resolved.",
    ],
    actions: [
      action(
        "emily-question-message",
        "message",
        "A practical response for Emily",
        "Hi Emily, I have your question about leaving the patio furniture out. I’m checking the preparation recommendation before giving you a definite answer.",
        "Should I leave the patio furniture out for the next showing?",
        "uncertain",
      ),
    ],
    status: "pending",
    origin: "sample",
    createdAt: "2026-10-23T13:35:00.000Z",
    recommendationId: recommendationIdFor("marcus", "emily", "cedar"),
  },
);
for (const [id, signalIds] of [
  ["package-michael-followup", ["task:task-michael-followup"]],
  ["package-emily-question", ["commitment:commitment-emily-question"]],
] as const) {
  const pkg = samplePackages.find((item) => item.id === id)!;
  pkg.signalIds = [...signalIds];
  pkg.recommendationId = recommendationIdFor(
    pkg.agentId,
    pkg.clientId,
    pkg.propertyId,
    [...signalIds],
  );
}
for (const appointment of sampleAppointments) {
  if (appointment.startsAt.startsWith("2026-10-21")) {
    appointment.startsAt = appointment.startsAt
      .replace("2026-10-21", "2026-10-23")
      .replace("-05:00", "-04:00");
    appointment.endsAt = appointment.endsAt
      .replace("2026-10-21", "2026-10-23")
      .replace("-05:00", "-04:00");
  }
}
const morningHuddle = sampleAppointments.find(
  (item) => item.id === "appointment-jordan-team",
)!;
morningHuddle.startsAt = "2026-10-23T10:30:00-04:00";
morningHuddle.endsAt = "2026-10-23T11:00:00-04:00";
sampleAppointments.push({
  id: "appointment-michael-tour",
  agentId: "jordan",
  clientId: "michael",
  propertyId: null,
  title: "Buyer tour · Michael Turner",
  startsAt: "2026-10-21T14:00:00-04:00",
  endsAt: "2026-10-21T15:30:00-04:00",
  location: "Two fictional Austin homes",
  status: "confirmed",
  briefing:
    "Tour completed October 21. Michael preferred the second home’s office and needed to consider the commute. Follow-up committed for October 22.",
});
sampleClients.find((item) => item.id === "parkers")!.notes = [
  "Looking for a bright home with a dedicated office. Friday, October 23, consultation confirmed.",
];
Object.assign(sampleAgents.find((item) => item.id === "olivia")!.style, {
  directness: "State the recommendation, then briefly explain why.",
  greeting: "Hi [first name],",
  signoff: "Warmly, Olivia",
  preferredWords: "clear plan; next step; comfortable",
  examples:
    "Hi Robert, the photos are ready. Please take a look at the brochure and tell me if there’s anything you’d like to adjust before we move ahead. Warmly, Olivia",
});
Object.assign(sampleAgents.find((item) => item.id === "marcus")!.style, {
  directness: "Very direct; one practical point at a time.",
  greeting: "Hi [first name]",
  signoff: "No sign-off in texts.",
  preferredWords: "quick update; check; confirm",
  examples:
    "Hi Emily, I have your question about the patio furniture. I’m checking the preparation recommendation before giving you a definite answer.",
});
Object.assign(sampleAgents.find((item) => item.id === "sophie")!.style, {
  directness: "Explain options gently and ask a clear question.",
  greeting: "Hi [first name],",
  signoff: "Happy to talk it through, Sophie",
  preferredWords: "options; comfortable; talk it through",
  examples:
    "Hi Noah, I’ve narrowed down the neighborhood options we discussed. Which commute would feel more manageable for you? Happy to talk it through, Sophie",
});
Object.assign(sampleAgents.find((item) => item.id === "maya")!.style, {
  directness: "Understated; no pressure or sales language.",
  greeting: "Hello [first name],",
  signoff: "Maya",
  preferredWords: "consider; when you are ready; considered",
  examples:
    "Hello Grace, let me know if you would like to discuss any part of the staging proposal. Once you’re comfortable with the plan, we can consider photography dates. Maya",
});
Object.assign(sampleAgents.find((item) => item.id === "daniel")!.style, {
  directness: "Brief and clear; one question at a time.",
  greeting: "Hi [first name]",
  signoff: "Use Daniel in email; omit a sign-off in texts.",
  preferredWords: "priorities; next step; keep it simple",
  examples:
    "Hi Ava, what’s the one thing you’d like us to focus on during our relocation call? I’ll keep the next steps simple.",
});
