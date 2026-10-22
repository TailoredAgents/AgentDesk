import { createHash } from "node:crypto";
import {
  currentContextText,
  currentFacts,
  mentionsFact,
  previousFacts,
} from "./intelligence";
import type { WorkProduct, WorkProductVersion } from "./work-product-types";
import { ApiError } from "./auth";
import { assertNoUnsupportedConfirmations } from "./ai";
import {
  assertNoUnsupportedCompletion,
  assertSupportedDates,
  explicitSourceDates,
} from "./ai-quality";
import type { Agent, WorkspaceData } from "./types";
import type {
  WorkProductContent,
  WorkProductKind,
  WorkProductSnapshot,
  WorkProductSource,
} from "./work-product-types";
import { workProductContentSchema } from "./work-product-schema";
export { workProductContentSchema } from "./work-product-schema";

export type WorkProductInput = {
  kind: WorkProductKind;
  agentId: string;
  clientId?: string | null;
  propertyId?: string | null;
  appointmentId?: string | null;
  sourceConversationId?: string | null;
  sourcePackageId?: string | null;
};
export type WorkProductContext = {
  kind: WorkProductKind;
  snapshot: WorkProductSnapshot;
  communicationStyle: Agent["style"];
  referenceDate: string;
};

function invalidLink(): never {
  throw new ApiError(
    400,
    "Choose source records assigned to the same agent, client and property.",
    "invalid_relationship",
  );
}

/** Deterministic authorised evidence snapshot, also rebuilt under the database write lock. */
export function buildWorkProductSnapshot(
  data: WorkspaceData,
  input: WorkProductInput,
): WorkProductSnapshot {
  const agent = data.agents.find((value) => value.id === input.agentId);
  if (!agent) return invalidLink();
  const appointment = input.appointmentId
    ? data.appointments.find(
        (value) =>
          value.id === input.appointmentId && value.agentId === agent.id,
      )
    : null;
  const selectedPackage = input.sourcePackageId
    ? data.packages.find(
        (value) =>
          value.id === input.sourcePackageId && value.agentId === agent.id,
      )
    : null;
  if (
    (input.appointmentId && !appointment) ||
    (input.sourcePackageId && !selectedPackage)
  )
    return invalidLink();
  const sourceConversationId =
    input.sourceConversationId ?? selectedPackage?.conversationId ?? null;
  if (
    input.sourceConversationId &&
    selectedPackage &&
    input.sourceConversationId !== selectedPackage.conversationId
  )
    return invalidLink();
  const selectedConversation = sourceConversationId
    ? data.conversations.find(
        (value) =>
          value.id === sourceConversationId && value.agentId === agent.id,
      )
    : null;
  if (sourceConversationId && !selectedConversation) return invalidLink();
  const clientId =
    input.clientId ??
    appointment?.clientId ??
    selectedPackage?.clientId ??
    selectedConversation?.clientId ??
    null;
  const propertyId =
    input.propertyId ??
    appointment?.propertyId ??
    selectedPackage?.propertyId ??
    selectedConversation?.propertyId ??
    null;
  const property = propertyId
    ? data.properties.find(
        (value) =>
          value.id === propertyId &&
          value.agentId === agent.id &&
          value.clientId === clientId,
      )
    : null;
  const client = clientId
    ? data.clients.find(
        (value) => value.id === clientId && value.agentId === agent.id,
      )
    : null;
  if ((clientId && !client) || (propertyId && !property)) return invalidLink();
  for (const value of [appointment, selectedPackage, selectedConversation]) {
    if (
      value &&
      (value.clientId !== clientId || value.propertyId !== propertyId)
    )
      return invalidLink();
  }
  if (input.kind === "seller_preparation" && (!client || !property))
    throw new ApiError(
      400,
      "A seller preparation package needs a client and their property.",
      "missing_context",
    );
  if (input.kind === "appointment_briefing" && !appointment)
    throw new ApiError(
      400,
      "Choose the appointment this briefing will prepare you for.",
      "missing_context",
    );
  const matches = (value: {
    agentId: string;
    clientId: string | null;
    propertyId: string | null;
  }) =>
    value.agentId === agent.id &&
    value.clientId === clientId &&
    (!value.propertyId || value.propertyId === propertyId);
  const memory = (data.clientFacts ?? []).filter(matches);
  const sources: WorkProductSource[] = [];
  const add = (id: string, label: string, text: string) => {
    const current = currentContextText(text, memory);
    if (current.trim()) sources.push({ id, label, text: current });
  };
  if (client) {
    add(
      `client:${client.id}`,
      "Client relationship",
      `Client: ${client.name}. Relationship: ${client.type}.`,
    );
    client.notes
      .slice(-6)
      .forEach((note, index) =>
        add(
          `client-note:${client.id}:${client.notes.length - Math.min(client.notes.length, 6) + index}`,
          "Recorded client note",
          note.slice(0, 2000),
        ),
      );
  }
  if (property) {
    add(
      `property:${property.id}`,
      "Property record",
      `Property: ${property.address}, ${property.city}. Stage: ${property.stage}. ${property.beds} bedrooms; ${property.baths} bathrooms; ${property.sqft} square feet. Description: ${property.description.slice(0, 1500)}`,
    );
    property.notes
      .slice(-6)
      .forEach((note, index) =>
        add(
          `property-note:${property.id}:${property.notes.length - Math.min(property.notes.length, 6) + index}`,
          "Recorded property note",
          note.slice(0, 2000),
        ),
      );
  }
  if (selectedConversation)
    add(
      `conversation:${selectedConversation.id}`,
      `Selected source conversation (${selectedConversation.createdAt}): ${selectedConversation.title}`,
      selectedConversation.transcript.slice(0, 40000),
    );
  if (selectedPackage)
    add(
      `package:${selectedPackage.id}`,
      "Review package — proposals and drafts are not evidence of execution",
      [
        `Package: ${selectedPackage.title}. Review status: ${selectedPackage.status}. Origin: ${selectedPackage.origin}.`,
        `Summary: ${selectedPackage.summary}`,
        ...selectedPackage.facts.map(
          (fact) =>
            `Fact (${fact.certainty}): ${fact.text} Source quote: ${fact.sourceQuote}`,
        ),
        ...selectedPackage.clarifications.map(
          (text) => `Unresolved clarification: ${text}`,
        ),
        ...selectedPackage.actions.map(
          (action) =>
            `Proposed ${action.kind}; decision=${action.status}. ${action.title}: ${action.body}`,
        ),
        "Approved message drafts are not sent messages. Proposed tasks are not completed work. Consult the source conversation and saved operational records.",
      ]
        .join("\n")
        .slice(0, 22000),
    );
  // Conversation order is stable and explicit. Selected source remains complete; history is bounded.
  if (client)
    data.conversations
      .filter((value) => matches(value) && value.id !== sourceConversationId)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      )
      .slice(0, 3)
      .forEach((value) =>
        add(
          `conversation:${value.id}`,
          `Related conversation (${value.createdAt}): ${value.title}`,
          value.transcript.slice(0, 4000),
        ),
      );
  if (client)
    data.tasks
      .filter(matches)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 20)
      .forEach((value) =>
        add(
          `task:${value.id}`,
          "Saved task record",
          `Task: ${value.title}. Status: ${value.status}. Due date: ${value.dueDate ?? "not recorded"}. Detail: ${value.detail.slice(0, 1600)}\nA task deadline is not an appointment confirmation.`,
        ),
      );
  if (client)
    data.commitments
      .filter(matches)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 20)
      .forEach((value) =>
        add(
          `commitment:${value.id}`,
          "Saved commitment or question",
          `Kind: ${value.kind}. ${value.title}. Status: ${value.status}. Due date: ${value.dueDate ?? "not recorded"}. Detail: ${value.detail.slice(0, 1600)}\nSource quote: ${value.sourceQuote.slice(0, 2000)}`,
        ),
      );
  const appointments = appointment
    ? [appointment]
    : client
      ? data.appointments
          .filter(matches)
          .sort(
            (a, b) =>
              a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
          )
          .slice(0, 4)
      : [];
  for (const value of appointments)
    add(
      `appointment:${value.id}`,
      value.id === appointment?.id
        ? "Selected appointment record"
        : "Related appointment record",
      `Appointment: ${value.title}. Status: ${value.status}. Starts: ${value.startsAt}. Ends: ${value.endsAt}. Location: ${value.location}. Briefing: ${value.briefing.slice(0, 2000)}`,
    );
  if (clientId)
    for (const fact of currentFacts(data, {
      agentId: agent.id,
      clientId,
      propertyId,
    })) {
      sources.push({
        id: `intelligence:${fact.id}`,
        label: `Reviewed client intelligence (${fact.certainty}; recorded ${fact.recordedAt}; reviewed ${fact.reviewedAt})`,
        text: `${fact.value}\nCertainty: ${fact.certainty}. Effective date: ${fact.effectiveDate ?? "not recorded"}. Source: ${fact.sourceConversationId}.\nEvidence: ${fact.sourceQuote}`,
      });
    }
  return {
    workspaceName: data.workspace.name,
    ...(agent.workstyle ? { workstyle: agent.workstyle } : {}),
    sample: data.workspace.sample,
    agent: { id: agent.id, name: agent.name, email: agent.email },
    client: client ? { id: client.id, name: client.name } : null,
    property: property
      ? { id: property.id, address: property.address, city: property.city }
      : null,
    appointment: appointment
      ? {
          id: appointment.id,
          title: appointment.title,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          location: appointment.location,
          status: appointment.status,
        }
      : null,
    sources,
  };
}

export function buildWorkProductContext(
  data: WorkspaceData,
  input: WorkProductInput,
): WorkProductContext {
  const snapshot = buildWorkProductSnapshot(data, input);
  return {
    kind: input.kind,
    snapshot,
    communicationStyle: data.agents.find(
      (value) => value.id === snapshot.agent.id,
    )!.style,
    referenceDate: data.workspace.referenceDate,
  };
}

export function workProductTitle(
  kind: WorkProductKind,
  snapshot: WorkProductSnapshot,
) {
  return kind === "seller_preparation"
    ? "Your seller preparation package"
    : "Your appointment preparation briefing";
}

export function workProductIntroduction(snapshot: WorkProductSnapshot) {
  const recipient = snapshot.client
    ? `${snapshot.client.name}, this guide`
    : "This guide";
  return `${recipient} brings your selected records together for review with ${snapshot.agent.name}. Recorded plans and open questions are separated from general preparation suggestions. Confirm unresolved details before making arrangements.`;
}

function groundingError(message: string): never {
  throw new ApiError(422, message, "ungrounded_work_product");
}

const uncertainEvidence =
  /\b(?:not (?:yet )?(?:confirmed|agreed|approved|booked|scheduled)|has not confirmed|hasn['’]t confirmed|requested|would like|wants?|unconfirmed|tentative|uncertain|undecided|unresolved|not sure|possibly|maybe|might|status: tentative|decision=pending)\b/i;
const legalClaims =
  /\b(?:legally binding|official (?:contract|disclosure|legal)|brokerage[- ]approved|legal advice|legally (?:required|obligated)|you (?:must|are required to) disclose|guaranteed (?:sale|price)|guarantee (?:a |the |your )?(?:sale|price))\b/i;

function moneyAmounts(text: string) {
  return [...text.matchAll(/(?:\$\s*|\bUSD\s*)(\d[\d,]*(?:\.\d+)?)/gi)].map(
    (match) => Number(match[1].replace(/,/g, "")),
  );
}

/** Human edits keep real citations and history, but are not represented as machine-verified facts. */
export function validateWorkProductContent(
  content: unknown,
  snapshot: WorkProductSnapshot,
  options: { humanEdited?: boolean } = {},
): WorkProductContent {
  const parsed = workProductContentSchema.safeParse(content);
  if (!parsed.success)
    throw new ApiError(
      400,
      "The work product has invalid or overly long content. Review its sections and try again.",
      "invalid_work_product",
    );
  const output = parsed.data;
  if (
    output.sections.reduce(
      (count, section) => count + section.items.length,
      0,
    ) > 48
  )
    throw new ApiError(
      400,
      "Keep the work product to 48 useful checklist items or fewer.",
      "invalid_work_product",
    );
  if (!options.humanEdited) {
    if (
      ![
        workProductTitle("seller_preparation", snapshot),
        workProductTitle("appointment_briefing", snapshot),
      ].includes(output.title) ||
      output.introduction !== workProductIntroduction(snapshot)
    )
      groundingError(
        "The work product introduction must not add unsupported transaction claims.",
      );
  }
  const sources = new Map(
    snapshot.sources.map((source) => [source.id, source]),
  );
  if (sources.size !== snapshot.sources.length)
    throw new ApiError(
      400,
      "The source snapshot contains duplicate identifiers.",
      "invalid_snapshot",
    );
  for (const section of output.sections) {
    if (
      !options.humanEdited &&
      (legalClaims.test(section.title) ||
        /\$\s*\d|\b20\d{2}-\d{2}-\d{2}\b/.test(section.title))
    )
      groundingError(
        "Use a descriptive section heading without legal claims, prices or dates.",
      );
    for (const item of section.items) {
      if (item.certainty === "general") {
        if (item.sourceId !== null || item.sourceQuote !== null)
          groundingError(
            "General suggestions cannot be presented as recorded client evidence.",
          );
        if (!["general_guidance", "next_steps"].includes(section.kind))
          groundingError(
            "Keep general suggestions separate from recorded facts and open client questions.",
          );
        const unconditional = item.text.replace(
          /\b(?:if|once|when|after|until|before)\b[^.!?]*\b(?:is|are|was|were|has been|have been)\s+(?:booked|scheduled|confirmed|approved)\b/gi,
          "",
        );
        if (
          !options.humanEdited &&
          (legalClaims.test(item.text) ||
            moneyAmounts(item.text).length ||
            /\b(?:20\d{2}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(
              item.text,
            ) ||
            /\b(?:is|are|was|were|has been|have been)\s+(?:booked|scheduled|confirmed|approved|sent|delivered)\b|\b(?:i|we|agentdesk)\s+(?:will|sent|delivered|guarantee)\b|\b(?:your|the|this)\s+(?:roof|foundation|home|house|property|plumbing|wiring)\s+(?:is|has|needs|requires)\b/i.test(
              unconditional,
            ))
        )
          groundingError(
            "A general suggestion introduced a specific transaction fact, scheduling claim or legal instruction.",
          );
      } else {
        if (section.kind === "general_guidance")
          groundingError(
            "Recorded plans belong in a recorded-facts or next-steps section.",
          );
        const source = item.sourceId ? sources.get(item.sourceId) : undefined;
        if (
          !source ||
          !item.sourceQuote ||
          !source.text.includes(item.sourceQuote)
        )
          groundingError(
            "Every recorded item must cite an exact quote from its retained source record.",
          );
        if (section.kind === "open_questions" && item.certainty !== "uncertain")
          groundingError("An open question must remain explicitly uncertain.");
        if (!options.humanEdited) {
          if (legalClaims.test(item.text))
            groundingError(
              "Work products cannot provide legal advice or represent official contracts or brokerage-approved forms.",
            );
          if (
            item.certainty === "confirmed" &&
            uncertainEvidence.test(item.sourceQuote)
          )
            groundingError(
              "The work product presented uncertain or proposed work as confirmed.",
            );
          if (
            item.certainty === "confirmed" &&
            item.sourceId!.startsWith("appointment:") &&
            /Status: tentative\b/.test(source.text)
          )
            groundingError(
              "A tentative appointment must remain uncertain in the work product.",
            );
          if (
            item.sourceId!.startsWith("package:") &&
            item.certainty === "confirmed"
          )
            groundingError(
              "A proposed review package cannot establish a confirmed transaction fact. Cite the conversation or operational record.",
            );
          const supportedMoney = new Set(moneyAmounts(item.sourceQuote));
          if (
            moneyAmounts(item.text).some(
              (amount) => !supportedMoney.has(amount),
            )
          )
            groundingError(
              "The work product added a price unsupported by its evidence.",
            );
          for (const match of item.text.matchAll(
            /\b(?:mold|asbestos|lead paint|water damage|structural damage|leaks?|defects?|renovated|new roof|code compliant)\b/gi,
          )) {
            if (
              !item.sourceQuote.toLowerCase().includes(match[0].toLowerCase())
            )
              groundingError(
                "The work product introduced a property condition that is not in its source evidence.",
              );
          }
          for (const match of item.text.matchAll(
            /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g,
          )) {
            if (!item.sourceQuote.includes(match[0]))
              groundingError(
                "The appointment time is not supported by its quoted record.",
              );
          }
          // A readable rendering of an explicitly quoted appointment timestamp
          // is evidence-equivalent; keep its recorded wall time and date.
          const dateEvidence = item.sourceId!.startsWith("appointment:")
            ? item.sourceQuote.replace(
                /\b(20\d{2}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})/g,
                (stamp, date, hours, minutes) => {
                  const day = new Date(`${date}T12:00:00Z`);
                  const hour = Number(hours);
                  if (
                    Number.isNaN(day.valueOf()) ||
                    hour > 23 ||
                    Number(minutes) > 59
                  )
                    return stamp;
                  const readable = new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(day);
                  return `${stamp} (${readable}; ${hour % 12 || 12}:${minutes} ${hour < 12 ? "am" : "pm"})`;
                },
              )
            : item.sourceQuote;
          if (
            explicitSourceDates(item.text).some((date) => date.weekdayConflict)
          )
            groundingError(
              "The document's weekday disagrees with its calendar date.",
            );
          assertSupportedDates(item.text, dateEvidence);
          assertNoUnsupportedConfirmations(item.text, source.text);
          assertNoUnsupportedCompletion(item.text, source.text);
        }
      }
    }
  }
  if (
    !options.humanEdited &&
    !output.sections.some((section) => section.kind === "recorded_facts")
  )
    groundingError(
      "Include the recorded context separately from preparation suggestions.",
    );
  return output;
}

/** The offline presentation fallback is deliberately limited to the designated fictional listing. */
export function buildSavedSellerContent(
  snapshot: WorkProductSnapshot,
): WorkProductContent {
  if (
    !snapshot.sample ||
    snapshot.client?.id !== "sarah" ||
    snapshot.property?.id !== "willow"
  )
    throw new ApiError(
      400,
      "This saved example belongs only to the designated fictional Sarah and Willow Lane listing.",
      "sample_only",
    );
  const findQuote = (pattern: RegExp) => {
    for (const source of snapshot.sources.filter(
      (item) => !item.id.startsWith("package:"),
    )) {
      const match = source.text.match(pattern);
      if (match) return { sourceId: source.id, sourceQuote: match[0] };
    }
    return null;
  };
  const cleaning = findQuote(
    /Cleaning (?:booked|confirmed) for Monday, October 26\.?|The cleaners are booked for Monday, October 26\.?/i,
  );
  const photography = findQuote(
    /Tuesday afternoon photography is requested, not confirmed\.?|She would like photography next Tuesday afternoon, October 27, but the photographer has not confirmed a time\.?/i,
  );
  const launch = findQuote(
    /We have not agreed on a listing launch date\.?|No photography time or listing launch date was confirmed\.?/i,
  );
  const checklist = findQuote(
    /I also need to send Sarah the preparation checklist before the weekend/i,
  );
  const patio = findQuote(
    /Should (?:I|we) leave the patio furniture out[^.!?]*\?|(?:Sarah (?:also )?asked|She asked)[^.!?]*patio furniture[^.!?]*[.?]/i,
  );
  const propertySource = snapshot.sources.find(
    (item) => item.id === "property:willow",
  );
  if (!cleaning || !photography || !propertySource)
    throw new ApiError(
      400,
      "The saved example needs its original cleaning, photography and property evidence.",
      "missing_sample_evidence",
    );
  const general = (text: string) => ({
    text,
    certainty: "general" as const,
    sourceId: null,
    sourceQuote: null,
  });
  const content: WorkProductContent = {
    title: workProductTitle("seller_preparation", snapshot),
    introduction: workProductIntroduction(snapshot),
    sections: [
      {
        title: "The plans you have discussed",
        kind: "recorded_facts",
        items: [
          {
            text: "Cleaning is booked for Monday, October 26.",
            certainty: "confirmed",
            ...cleaning,
          },
          {
            text: "Tuesday afternoon photography is requested and still needs photographer confirmation.",
            certainty: "requested",
            ...photography,
          },
        ],
      },
      {
        title: "Photography preparation ideas",
        kind: "general_guidance",
        items: [
          general(
            "Clear everyday items from counters and tables, leaving a few simple accents.",
          ),
          general(
            "Open curtains or blinds where practical, and check that visible light fixtures work.",
          ),
          general(
            "Tidy entryways, floors and the main living spaces so each room is easy to photograph.",
          ),
          general(
            "Put away personal paperwork, valuables and identifying photographs you prefer not to show.",
          ),
        ],
      },
      {
        title: "Cleaning and staging considerations",
        kind: "general_guidance",
        items: [
          general(
            "Give mirrors, visible windows and high-touch surfaces a final check after cleaning.",
          ),
          general(
            "Keep walkways clear and arrange furniture so rooms feel easy to move through.",
          ),
          general(
            "Discuss any furniture changes with your agent before moving large or delicate items.",
          ),
          general(
            "Plan a comfortable place for pets during any appointment, once its timing is confirmed.",
          ),
        ],
      },
      {
        title: "Still to confirm",
        kind: "open_questions",
        items: [
          {
            text: "Which photography time can the photographer confirm?",
            certainty: "uncertain",
            ...photography,
          },
          ...(patio
            ? [
                {
                  text: "Should the patio furniture stay out for photography?",
                  certainty: "uncertain" as const,
                  ...patio,
                },
              ]
            : []),
          ...(launch
            ? [
                {
                  text: "The listing launch date remains undecided.",
                  certainty: "uncertain" as const,
                  ...launch,
                },
              ]
            : []),
        ],
      },
      {
        title: "Your next steps together",
        kind: "next_steps",
        items: [
          {
            text: "Check photography availability before treating the requested time as booked.",
            certainty: "requested",
            ...photography,
          },
          ...(checklist
            ? [
                {
                  text: "Jordan planned to share the preparation checklist before the weekend; delivery is not recorded here.",
                  certainty: "requested" as const,
                  ...checklist,
                },
              ]
            : []),
          general(
            "Review these suggestions with your agent and decide which are useful for your home.",
          ),
          general(
            "Keep open questions visible until you and your agent agree on the next step.",
          ),
        ],
      },
    ],
  };
  return validateWorkProductContent(content, snapshot);
}

/** Refresh only items that actually mention superseded facts; preserve unrelated text and citations. */
export function refreshWorkProduct(
  data: WorkspaceData,
  product: WorkProduct,
  version: WorkProductVersion,
) {
  const snapshot = buildWorkProductSnapshot(data, product);
  const facts = (data.clientFacts ?? []).filter(
    (f) =>
      f.agentId === product.agentId &&
      f.clientId === product.clientId &&
      f.propertyId === product.propertyId,
  );
  const replacements = facts.filter(
    (f) =>
      (f.status === "current" || f.status === "retired") && f.supersedes.length,
  );
  const content = structuredClone(version.content);
  for (const section of content.sections)
    for (const item of section.items) {
      const replacement = replacements.find((f) =>
        previousFacts(f, facts).some((old) => mentionsFact(item.text, old)),
      );
      if (replacement) {
        item.text =
          replacement.status === "retired"
            ? "This earlier detail was retired by a reviewer. Confirm the current arrangement before using it."
            : replacement.value;
        if (
          replacement.status === "retired" &&
          !snapshot.sources.some(
            (s) => s.id === `intelligence:${replacement.id}`,
          )
        )
          snapshot.sources.push({
            id: `intelligence:${replacement.id}`,
            label: "Reviewed retirement",
            text: replacement.value,
          });
        item.sourceId = `intelligence:${replacement.id}`;
        item.sourceQuote = replacement.value;
        item.certainty =
          replacement.status === "retired" ||
          replacement.certainty === "disputed"
            ? "uncertain"
            : replacement.certainty;
        if (section.kind === "open_questions" && item.certainty !== "uncertain")
          item.certainty = "uncertain";
      } else if (item.sourceId && item.sourceQuote) {
        const source = version.snapshot.sources.find(
          (s) => s.id === item.sourceId,
        );
        if (
          source &&
          !snapshot.sources.some(
            (s) => s.id === item.sourceId && s.text.includes(item.sourceQuote!),
          )
        ) {
          const retainedId = `retained:${createHash("sha256").update(`${version.id}:${source.id}`).digest("hex")}`;
          if (!snapshot.sources.some((s) => s.id === retainedId))
            snapshot.sources.push({
              ...source,
              id: retainedId,
              label: `Retained evidence for unchanged content: ${source.label}`,
            });
          item.sourceId = retainedId;
        }
      }
    }
  return {
    snapshot,
    content: validateWorkProductContent(content, snapshot, {
      humanEdited: true,
    }),
  };
}
