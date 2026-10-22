import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import type { FunctionTool } from "openai/resources/responses/responses";
import { ApiError } from "../auth";
import { buildAIContext, buildProviderContext } from "../ai-context";
import { currentContextText, situationImpacts } from "../intelligence";
import {
  getWorkspace,
  findConversationPackageByRequestId,
  findWorkProductByRequestId,
  savePreparedMessageDraft,
  preparedMessageEditExists,
} from "../repository";
import { prepareConversation } from "../conversation-preparation";
import { prepareFollowUp } from "../follow-up-preparation";
import { prepareWorkProduct } from "../preparation";
import { rewriteMessage } from "../ai";
import { buildWorkProductSnapshot } from "../work-product-content";
import { SAMPLE_WORKSPACE_ID } from "../db/seed-data";
import type { WorkspaceData, WorkPackage } from "../types";
import type { Principal, PageContext, ToolResult, Artifact } from "./types";
import { resultSchema } from "./types";
import { hash } from "./store";
import { assertAIBudget } from "../ai-budget";

const id = z.string().min(1).max(240);
const schemas = {
  find_records: z.object({ query: z.string().trim().min(2).max(100) }).strict(),
  day_overview: z
    .object({
      section: z.enum([
        "priorities",
        "appointments",
        "activity",
        "team",
        "help",
      ]),
    })
    .strict(),
  client_context: z
    .object({ clientId: id, propertyId: id.nullable() })
    .strict(),
  read_review: z.object({ packageId: id }).strict(),
  prepare_follow_up: z
    .object({ clientId: id, recommendationId: id.nullable() })
    .strict(),
  capture_interaction: z
    .object({
      clientId: id,
      propertyId: id.nullable(),
      title: z.string().min(3).max(160),
    })
    .strict(),
  prepare_document: z
    .object({
      kind: z.enum(["seller_preparation", "appointment_briefing"]),
      clientId: id.nullable(),
      propertyId: id.nullable(),
      appointmentId: id.nullable(),
      newVersion: z.boolean(),
    })
    .strict(),
  revise_message: z
    .object({
      packageId: id,
      actionId: id,
      instruction: z.enum(["shorter", "natural", "professional"]),
    })
    .strict(),
};
const descriptions: Record<keyof typeof schemas, string> = {
  find_records:
    "Find authorized fictional clients/properties by a literal name/address fragment in the current user message. Multiple matches require clarification; do not choose one. Use returned IDs, never guess them.",
  day_overview:
    "Read this agent's current priorities, upcoming appointments, saved AI activity, or aggregate fictional team counts. help explains supported workflows. Missing completion is not proof of no contact.",
  client_context:
    "Read current reviewed facts, evidence, workstyle, history, tasks, commitments, listing changes and saved documents for a uniquely identified client. Chat and pending proposals are not reviewed facts. Call before preparing work.",
  read_review:
    "Read an authorized existing review and its source. Pending proposals are not completed actions. No approvals are available to Copilot.",
  prepare_follow_up:
    "Prepare a real saved follow-up review using the existing recommendation pipeline; reuse prior work. First identify the client and inspect current context. Null recommendationId works only when exactly one exists. No messages are sent.",
  capture_interaction:
    "Process the CURRENT USER MESSAGE VERBATIM through the existing conversation pipeline to save notes, message, task and situation proposals for human review. No model-written transcript is accepted. Use null propertyId for unidentified showing addresses. Prior chat is not factual evidence.",
  prepare_document:
    "Create a real saved seller checklist or appointment briefing. Reuse a current existing version by default. newVersion=true explicitly prepares a new version, refreshing reviewed facts through existing document services. Final PDF approval remains human. A seller checklist requires a resolved client/property. An appointment briefing requires a returned authorized appointment; use its exact clientId/propertyId, including null for a team huddle or other appointment without a client. No client is required for such appointments.",
  revise_message:
    "Rewrite and SAVE one pending message draft in its existing review. Retains original wording and required approval. Only shorter, natural, professional are supported. Never edits an approved draft.",
};
export const definitions: FunctionTool[] = Object.entries(schemas).map(
  ([name, schema]) => ({
    type: "function",
    name,
    description: descriptions[name as keyof typeof schemas],
    strict: true,
    parameters: z.toJSONSchema(schema) as Record<string, unknown>,
  }),
);
export const writes = new Set([
  "prepare_follow_up",
  "capture_interaction",
  "prepare_document",
  "revise_message",
]);
export type ToolSession = {
  principal: Principal;
  text: string;
  context: PageContext;
  clients: Set<string>;
  readClients: Set<string>;
  packages: Set<string>;
  appointments: Set<string>;
};
const unavailable = (message: string): ToolResult => ({
  state: "requires_information",
  data: { message },
  artifacts: [],
  sourceIds: [],
});
export async function scopedWorkspace(p: Principal) {
  // Pilot requires a separate authenticated adapter and service registry. Fail closed.
  if (p.kind !== "sample" || p.workspaceId !== SAMPLE_WORKSPACE_ID)
    throw new ApiError(
      403,
      "Copilot is available only in the fictional sample preview.",
    );
  const all = await getWorkspace({ workspaceId: p.workspaceId });
  if (!all.workspace.sample || !all.agents.some((a) => a.id === p.agentId))
    throw new ApiError(403, "This agent is unavailable.");
  const own = <T extends { agentId: string }>(items: T[]) =>
    items.filter((i) => i.agentId === p.agentId);
  return {
    ...all,
    agents: all.agents.filter((a) => a.id === p.agentId),
    clients: own(all.clients),
    properties: own(all.properties),
    tasks: own(all.tasks),
    conversations: own(all.conversations),
    packages: own(all.packages),
    appointments: own(all.appointments),
    activities: own(all.activities),
    commitments: own(all.commitments),
    recommendations: own(all.recommendations),
    reviewHistory: own(all.reviewHistory),
    workProducts: own(all.workProducts),
    clientFacts: own(all.clientFacts ?? []),
  };
}
export async function validateContext(p: Principal, context: PageContext) {
  const d = await scopedWorkspace(p);
  if (
    (context.clientId && !d.clients.some((i) => i.id === context.clientId)) ||
    (context.propertyId &&
      !d.properties.some(
        (i) =>
          i.id === context.propertyId &&
          (!context.clientId || i.clientId === context.clientId),
      )) ||
    (context.packageId &&
      !d.packages.some(
        (i) =>
          i.id === context.packageId &&
          (!context.clientId || i.clientId === context.clientId),
      )) ||
    (context.documentId &&
      !d.workProducts.some(
        (i) =>
          i.id === context.documentId &&
          (!context.clientId || i.clientId === context.clientId),
      ))
  )
    throw new ApiError(
      403,
      "The page context is outside this sample agent's records.",
      "copilot_scope",
    );
  return d;
}
export function session(
  p: Principal,
  text: string,
  context: PageContext,
  d: WorkspaceData,
  priorClientIds: string[] = [],
): ToolSession {
  const ids = [
    context.clientId,
    d.properties.find((i) => i.id === context.propertyId)?.clientId,
    d.packages.find((i) => i.id === context.packageId)?.clientId,
    d.workProducts.find((i) => i.id === context.documentId)?.clientId,
  ];
  // Explicit page context takes precedence. Retain only the last resolved subject.
  const clients = ids.some(Boolean) ? ids : priorClientIds;
  const selected = new Set(
    clients.filter(
      (v): v is string => Boolean(v) && d.clients.some((c) => c.id === v),
    ),
  );
  const named = d.clients.filter((c) => {
    const first = c.name.split(" ")[0];
    return new RegExp(
      `\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    ).test(text);
  });
  if (named.some((c) => !selected.has(c.id))) selected.clear();
  return {
    principal: p,
    text,
    context,
    clients: selected,
    readClients: new Set(),
    packages: new Set(context.packageId ? [context.packageId] : []),
    appointments: new Set(),
  };
}
function client(
  d: WorkspaceData,
  s: ToolSession,
  id: string,
  prepared = false,
) {
  const c = d.clients.find((c) => c.id === id);
  if (!c || !s.clients.has(id))
    throw new ApiError(
      400,
      "Identify one client by name before using that record.",
      "copilot_identify",
    );
  if (prepared && !s.readClients.has(id))
    throw new ApiError(
      400,
      "Read this client's current context before preparing work.",
      "copilot_context",
    );
  return c;
}
function packageArtifact(
  p: WorkPackage,
  detail = "Saved inside AgentDesk. Open Review to inspect every proposal.",
): Artifact {
  return {
    title: p.title,
    state: p.status === "pending" ? "awaiting_review" : "reused",
    detail,
    target: { kind: "review", id: p.id },
  };
}
function found(
  data: unknown,
  sourceIds: string[],
  artifacts: Artifact[] = [],
): ToolResult {
  return {
    state: "found",
    data,
    sourceIds: sourceIds.slice(0, 120),
    artifacts,
  };
}

export async function executeTool(
  s: ToolSession,
  name: string,
  raw: string,
  requestId: string,
): Promise<ToolResult> {
  assertAIBudget();
  const schema = schemas[name as keyof typeof schemas];
  if (!schema)
    throw new ApiError(
      403,
      "This operation is not available to Copilot.",
      "copilot_tool_denied",
    );
  if (raw.length > 12000)
    throw new ApiError(400, "Tool arguments are too large.");
  const args = schema.parse(JSON.parse(raw));
  const d = await scopedWorkspace(s.principal);
  const scope = { workspaceId: s.principal.workspaceId };
  let result: ToolResult;
  switch (name) {
    case "find_records": {
      const { query } = args as z.infer<typeof schemas.find_records>;
      if (!s.text.toLowerCase().includes(query.toLowerCase()))
        return unavailable(
          "Use a name or address fragment from the user's current message, or the already selected client. Ask for a name if unclear.",
        );
      const q = query.toLowerCase();
      const properties = d.properties.filter((p) =>
        `${p.address} ${p.city}`.toLowerCase().includes(q),
      );
      const clients = d.clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          properties.some((p) => p.clientId === c.id),
      );
      if (clients.length === 1) {
        s.clients.clear();
        s.readClients.clear();
        s.packages.clear();
        s.clients.add(clients[0].id);
      }
      result = found(
        {
          matches: clients.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            properties: d.properties
              .filter((p) => p.clientId === c.id)
              .map((p) => ({ id: p.id, address: p.address })),
          })),
          resolution: clients.length === 1 ? "identified" : "clarify",
          warning:
            clients.length > 1 ? "Ask which client; none was selected." : null,
        },
        clients.map((c) => `client:${c.id}`),
      );
      break;
    }
    case "day_overview": {
      const { section } = args as z.infer<typeof schemas.day_overview>;
      if (section === "help")
        return found(
          {
            supported: [
              "Find current client/listing context",
              "Prepare follow-ups, conversation proposals and seller/appointment documents",
              "Polish a pending message",
              "Open saved work for structured human review",
            ],
            unavailable: [
              "Sending email or SMS",
              "Lofty and private pilot records",
              "Approving work through chat",
              "Completing tasks or changing calendar bookings",
            ],
            sample: true,
          },
          [],
        );
      if (section === "team") {
        const all = await getWorkspace(scope);
        return found(
          {
            fictionalTeam: true,
            agents: all.agents.map((a) => ({
              name: a.name,
              openTasks: all.tasks.filter(
                (t) => t.agentId === a.id && t.status === "open",
              ).length,
              pendingReviews: all.packages.filter(
                (p) => p.agentId === a.id && p.status === "pending",
              ).length,
            })),
            note: "Aggregate shared sample only; no pilot records or private individual chat.",
          },
          ["workspace:team"],
        );
      }
      if (section === "activity")
        return found(
          {
            activities: d.activities.slice(0, 20),
            warning:
              "Approved message drafts are not sent. Internal records are not CRM sync.",
          },
          d.activities.slice(0, 20).map((i) => `activity:${i.id}`),
        );
      if (section === "appointments") {
        const appointments = d.appointments
          .filter((a) => a.endsAt >= d.workspace.referenceDate)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 8);
        appointments.forEach((a) => s.appointments.add(a.id));
        if (appointments[0]?.clientId) s.clients.add(appointments[0].clientId);
        return found(
          { referenceDate: d.workspace.referenceDate, appointments },
          appointments.map((a) => `appointment:${a.id}`),
          appointments.slice(0, 4).map((a) => ({
            title: a.title,
            state: "found",
            detail: a.status,
            target: { kind: "appointment", id: a.id },
          })),
        );
      }
      return found(
        {
          referenceDate: d.workspace.referenceDate,
          clients: d.clients.map((c) => ({ id: c.id, name: c.name })),
          followUps: d.recommendations.map(({ sourceSnapshot, ...r }) => r),
          openTasks: d.tasks.filter((t) => t.status === "open").slice(0, 20),
          commitments: d.commitments
            .filter((c) => c.status === "open")
            .slice(0, 20),
        },
        [
          ...d.tasks.map((t) => `task:${t.id}`),
          ...d.commitments.map((c) => `commitment:${c.id}`),
          ...d.recommendations.map((r) => `recommendation:${r.id}`),
        ],
      );
    }
    case "client_context": {
      const { clientId, propertyId } = args as z.infer<
        typeof schemas.client_context
      >;
      const c = client(d, s, clientId);
      const property = propertyId
        ? d.properties.find(
            (p) => p.id === propertyId && p.clientId === clientId,
          )
        : null;
      if (propertyId && !property)
        throw new ApiError(403, "The property does not belong to this client.");
      s.readClients.add(c.id);
      const packages = d.packages
        .filter((p) => p.clientId === c.id)
        .slice(0, 8);
      packages.forEach((p) => s.packages.add(p.id));
      const appointments = d.appointments.filter((a) => a.clientId === c.id);
      appointments.forEach((a) => s.appointments.add(a.id));
      const docs = d.workProducts.filter((p) => p.clientId === c.id);
      const tasks = d.tasks.filter((t) => t.clientId === c.id);
      const facts = (d.clientFacts ?? []).filter(
        (f) => f.clientId === c.id && f.status === "current",
      );
      result = found(
        {
          client: { id: c.id, name: c.name },
          properties: d.properties
            .filter((p) => p.clientId === c.id)
            .map(({ id, address, stage }) => ({ id, address, stage })),
          context: buildProviderContext(
            buildAIContext(
              d,
              s.principal.agentId,
              c.id,
              propertyId,
              "Current reviewed records; no new interaction supplied.",
            ),
          ),
          facts,
          tasks,
          appointments,
          followUps: d.recommendations
            .filter((r) => r.clientId === c.id)
            .map(({ sourceSnapshot, ...r }) => r),
          situationChanges: situationImpacts(d).filter(
            (i) => i.clientId === c.id,
          ),
          reviews: packages.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            actions: p.actions.map((a) => ({
              id: a.id,
              kind: a.kind,
              status: a.status,
              title: a.title,
              body: a.body.slice(0, 1800),
            })),
          })),
          documents: docs.map((p) => ({
            id: p.id,
            kind: p.kind,
            propertyId: p.propertyId,
            versions: p.versions.map((v) => ({
              id: v.id,
              status: v.status,
              version: v.version,
              title: v.content.title,
              hasPdf: v.hasPdf,
            })),
          })),
        },
        [
          `client:${c.id}`,
          ...facts.map((f) => `fact:${f.id}`),
          ...tasks.map((t) => `task:${t.id}`),
          ...appointments.map((a) => `appointment:${a.id}`),
          ...packages.map((p) => `review:${p.id}`),
          ...docs.map((p) => `document:${p.id}`),
        ],
        [
          {
            title: c.name,
            state: "found",
            detail: "Current client record and reviewed context",
            target: { kind: "client", id: c.id },
          },
        ],
      );
      break;
    }
    case "read_review": {
      const { packageId } = args as z.infer<typeof schemas.read_review>;
      const p = d.packages.find((p) => p.id === packageId);
      if (!p || (!s.packages.has(p.id) && !s.clients.has(p.clientId)))
        throw new ApiError(403, "Identify this review's client first.");
      s.packages.add(p.id);
      s.clients.add(p.clientId);
      result = found(
        {
          review: p,
          source: d.conversations.find((c) => c.id === p.conversationId),
          warning:
            "This source and its pending proposals are unreviewed; not current business facts.",
        },
        [`review:${p.id}`],
        [packageArtifact(p)],
      );
      break;
    }
    case "prepare_follow_up": {
      const { clientId, recommendationId } = args as z.infer<
        typeof schemas.prepare_follow_up
      >;
      client(d, s, clientId, true);
      const candidates = d.recommendations.filter(
        (r) =>
          r.clientId === clientId &&
          (!recommendationId || r.id === recommendationId),
      );
      if (candidates.length !== 1)
        return unavailable(
          candidates.length
            ? "More than one follow-up applies. Ask which one to prepare."
            : "No current follow-up recommendation exists. Ask for a specific interaction or next step to capture for review.",
        );
      const reusable = d.packages.find((p) => p.id === candidates[0].packageId);
      if (reusable) {
        s.packages.add(reusable.id);
        return found(
          { packageId: reusable.id, actions: reusable.actions, reused: true },
          [`review:${reusable.id}`],
          [{ ...packageArtifact(reusable), state: "reused" }],
        );
      }
      assertAIBudget();
      const packageId = await prepareFollowUp(
        candidates[0].id,
        s.principal.agentId,
      );
      const p = (await scopedWorkspace(s.principal)).packages.find(
        (p) => p.id === packageId,
      )!;
      s.packages.add(p.id);
      result = {
        ...found(
          { packageId: p.id, actions: p.actions },
          [`review:${p.id}`],
          [packageArtifact(p)],
        ),
        state: "prepared",
      };
      break;
    }
    case "capture_interaction": {
      const { clientId, propertyId, title } = args as z.infer<
        typeof schemas.capture_interaction
      >;
      client(d, s, clientId, true);
      buildAIContext(d, s.principal.agentId, clientId, propertyId, s.text);
      if (s.text.length < 30)
        return unavailable(
          "Describe the interaction or requested next step in a little more detail.",
        );
      const previous = await findConversationPackageByRequestId(
        requestId,
        scope,
      );
      const saved = previous
        ? { packageId: previous.package.id }
        : await prepareConversation({
            agentId: s.principal.agentId,
            clientId,
            propertyId,
            title,
            transcript: s.text,
            source: "note",
            authorized: true,
            requestId,
          });
      const p = (await scopedWorkspace(s.principal)).packages.find(
        (p) => p.id === saved.packageId,
      )!;
      s.packages.add(p.id);
      result = {
        ...found(
          {
            packageId: p.id,
            actions: p.actions,
            clarifications: p.clarifications,
            warning:
              "Proposals only. Unidentified properties remain unassociated; review before applying.",
          },
          [`review:${p.id}`],
          [packageArtifact(p)],
        ),
        state: "prepared",
      };
      break;
    }
    case "prepare_document": {
      const a = args as z.infer<typeof schemas.prepare_document>;
      if (a.clientId) {
        client(d, s, a.clientId, true);
        buildAIContext(
          d,
          s.principal.agentId,
          a.clientId,
          a.propertyId,
          "Document request.",
        );
      }
      if (a.kind === "seller_preparation" && (!a.propertyId || !a.clientId))
        return unavailable(
          "Choose the seller and their property before preparing the checklist.",
        );
      if (
        a.kind === "appointment_briefing" &&
        (!a.appointmentId ||
          !s.appointments.has(a.appointmentId) ||
          !d.appointments.some(
            (i) =>
              i.id === a.appointmentId &&
              i.clientId === a.clientId &&
              i.propertyId === a.propertyId,
          ))
      )
        return unavailable(
          "Identify the appointment and its matching client/property first.",
        );
      const products = d.workProducts.filter(
        (p) =>
          p.kind === a.kind &&
          p.clientId === a.clientId &&
          p.propertyId === a.propertyId &&
          (p.appointmentId ?? null) === (a.appointmentId ?? null),
      );
      const selectedProduct = products.find(
        (p) => p.id === s.context.documentId,
      );
      if (products.length > 1 && !selectedProduct)
        return unavailable(
          "Several documents match. Open the document you want before requesting its update.",
        );
      const product = selectedProduct ?? products[0];
      const latest = product?.versions
        .slice()
        .sort((a, b) => b.version - a.version)[0];
      const current =
        latest &&
        isDeepStrictEqual(buildWorkProductSnapshot(d, product!), {
          ...latest.snapshot,
          sources: latest.snapshot.sources.filter(
            (s) => !s.id.startsWith("retained:"),
          ),
        });
      if (latest && latest.status !== "rejected" && current && !a.newVersion)
        return found(
          { productId: product.id, versionId: latest.id, reused: true },
          [`document:${product.id}`],
          [
            {
              title: latest.content.title,
              state: "reused",
              detail:
                latest.status === "approved"
                  ? "Existing approved version; PDF available in the record."
                  : "Existing draft; awaiting your review.",
              target: {
                kind: "document",
                id: product.id,
                versionId: latest.id,
              },
            },
          ],
        );
      const existing = await findWorkProductByRequestId(requestId, scope);
      const saved =
        existing ??
        (await prepareWorkProduct({
          kind: a.kind,
          agentId: s.principal.agentId,
          clientId: a.clientId,
          propertyId: a.propertyId,
          appointmentId: a.appointmentId,
          requestId,
          ...(latest
            ? {
                productId: product.id,
                copyVersionId: latest.id,
                refreshFromCurrent: true,
              }
            : {}),
        }));
      const updated = (await scopedWorkspace(s.principal)).workProducts.find(
        (p) => p.id === saved.productId,
      )!;
      const version = updated.versions.find((v) => v.id === saved.versionId)!;
      result = {
        ...found(
          {
            productId: updated.id,
            versionId: version.id,
            status: version.status,
          },
          [`document:${updated.id}`],
          [
            {
              title: version.content.title,
              state:
                version.status === "pending" ? "awaiting_review" : "reused",
              detail:
                "Saved version. Review the document before finalizing its PDF.",
              target: {
                kind: "document",
                id: updated.id,
                versionId: version.id,
              },
            },
          ],
        ),
        state: "prepared",
      };
      break;
    }
    case "revise_message": {
      const a = args as z.infer<typeof schemas.revise_message>;
      const p = d.packages.find((p) => p.id === a.packageId);
      if (!p || !s.packages.has(p.id))
        throw new ApiError(403, "Read the saved review before rewriting it.");
      client(d, s, p.clientId, true);
      const action = p.actions.find(
        (i) => i.id === a.actionId && i.kind === "message",
      );
      if (!action) throw new ApiError(404, "The message draft is unavailable.");
      const requestHash = hash(a);
      if (!(await preparedMessageEditExists(requestId, requestHash, scope))) {
        if (action.status !== "pending")
          return unavailable(
            "This message has already been reviewed. Existing approvals cannot be changed through Copilot.",
          );
        const source = d.conversations.find((c) => c.id === p.conversationId)!;
        const memory = (d.clientFacts ?? []).filter(
          (f) => f.clientId === p.clientId,
        );
        if (currentContextText(action.body, memory) !== action.body)
          return unavailable(
            "This draft contains superseded information. Prepare a current follow-up before polishing it.",
          );
        const rewritten = await rewriteMessage(
          buildAIContext(
            d,
            s.principal.agentId,
            p.clientId,
            p.propertyId,
            source.transcript,
          ),
          p,
          action.body,
          a.instruction,
        );
        assertAIBudget();
        await savePreparedMessageDraft(
          {
            requestId,
            requestHash,
            packageId: p.id,
            actionId: action.id,
            agentId: s.principal.agentId,
            expectedBody: action.body,
            body: rewritten.body,
          },
          scope,
        );
      }
      const updated = (await scopedWorkspace(s.principal)).packages.find(
        (i) => i.id === p.id,
      )!;
      result = {
        ...found(
          {
            packageId: p.id,
            action: updated.actions.find((i) => i.id === action.id),
          },
          [`review:${p.id}`],
          [
            packageArtifact(
              updated,
              "Revised wording saved. Your structured review is still required.",
            ),
          ],
        ),
        state: "prepared",
      };
      break;
    }
    default:
      throw new ApiError(403, "Unavailable operation.");
  }
  // Validate the result envelope and cap provider-bound record payloads.
  if (JSON.stringify(result.data).length > 45000)
    result.data = {
      limited: true,
      records: JSON.stringify(result.data).slice(0, 45000),
      message:
        "Result truncated; ask a narrower question before relying on omitted records.",
    };
  return resultSchema.parse(result);
}
