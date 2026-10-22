import { z } from "zod";
import { externalId, parseProviderJson } from "./security";
import {
  ProviderError,
  allCapabilities,
  type CrmProvider,
  type Json,
  type Projection,
  type RecordKind,
  type TokenSet,
  type WriteProposal,
} from "./types";

const object = (v: unknown): Json => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new ProviderError("invalid_response");
  return v as Json;
};
const array = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new ProviderError("invalid_response");
  return v;
};
function id(v: unknown) {
  try {
    return externalId(v);
  } catch {
    throw new ProviderError("invalid_response");
  }
}
function pick(source: Json, keys: string[]): Json {
  return Object.fromEntries(
    keys
      .filter((k) => source[k] !== undefined)
      .map((k) => {
        const v = source[k];
        return [
          k,
          k === "listingId" && v != null
            ? String(v)
            : /Id$/.test(k) && v != null
              ? id(v)
              : v,
        ];
      }),
  );
}
function date(value: unknown, documentedUTC = false): string | null {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 1e11 &&
    value < 1e14
  )
    return new Date(value).toISOString();
  if (typeof value !== "string") return null;
  const input =
    documentedUTC && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
      ? value.replace(" ", "T") + "Z"
      : value;
  if (!/(Z|[+-]\d\d:\d\d)$/.test(input) || !Number.isFinite(Date.parse(input)))
    return null;
  return new Date(input).toISOString();
}

/** Whitelisted provider projections; no wholesale CRM payloads or guessed ID matching. */
export function mapRecord(
  kind: RecordKind,
  raw: unknown,
  parentId?: string,
): Projection {
  const source = object(raw);
  const data = kind === "lead" && source.lead ? object(source.lead) : source;
  const recordId = id(
    kind === "lead"
      ? data.leadId
      : kind === "note"
        ? data.noteId
        : kind === "transaction"
          ? data.transactionId
          : data.id,
  );
  const leadId =
    kind === "lead"
      ? recordId
      : data.leadId == null && parentId
        ? id(parentId)
        : id(data.leadId);
  if (parentId && leadId !== parentId)
    throw new ProviderError("invalid_response");
  const fields: Record<RecordKind, string[]> = {
    lead: [
      "leadId",
      "teamId",
      "assignedUserId",
      "firstName",
      "lastName",
      "emails",
      "phones",
      "stage",
      "source",
      "lastTouch",
      "lastVisit",
      "cannotCall",
      "cannotText",
      "cannotEmail",
      "unsubscription",
      "phoneStatuses",
      "ownershipScope",
      "ownershipId",
      "buyingTimeFrame",
      "sellingTimeFrame",
    ],
    note: [
      "noteId",
      "leadId",
      "content",
      "creatorId",
      "createTime",
      "lastUpdate",
      "isPin",
      "systemNote",
    ],
    task: [
      "id",
      "leadId",
      "content",
      "type",
      "startAt",
      "endAt",
      "timeZoneCode",
      "finishFlag",
      "assignedUserId",
      "teamId",
      "address",
      "lastUpdate",
    ],
    activity: [
      "id",
      "leadId",
      "agentId",
      "channel",
      "activityTime",
      "note",
      "emailSubject",
      "direction",
      "callingOutcome",
      "emailEventType",
      "communicationType",
    ],
    transaction: [
      "transactionId",
      "transactionName",
      "assignedAgent",
      "transactionType",
      "transactionStatus",
      "homePrice",
      "expectedCloseDate",
      "closeDate",
      "updated",
    ],
  };
  const projected = pick(data, fields[kind]);
  // IDs with non-*Id names still need exact string normalization.
  if (kind === "task" || kind === "activity") projected.id = recordId;
  if (kind === "transaction" && data.assignedAgent != null)
    projected.assignedAgent = id(data.assignedAgent);
  if (kind === "lead") {
    projected.teamId = id(data.teamId);
    projected.assignedUserId = id(data.assignedUserId);
    if (Array.isArray(data.leadPropertyList))
      projected.properties = data.leadPropertyList
        .slice(0, 30)
        .map((p) =>
          pick(object(p), [
            "id",
            "listingId",
            "streetAddress",
            "city",
            "state",
            "zipCode",
            "price",
            "listingStatus",
            "mailAddress",
          ]),
        );
  }
  return {
    kind,
    externalId: recordId,
    leadId,
    data: projected,
    sourceUpdatedAt: date(
      data.lastUpdateTime ?? data.lastUpdate ?? data.updated,
      kind === "note",
    ),
    deleted: data.deleteFlag === true,
  };
}

export const proposalSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("notes.create"),
      leadId: z.string().transform(externalId),
      content: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("tasks.create"),
      leadId: z.string().transform(externalId),
      content: z.string().trim().min(1).max(1000),
      endAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      operation: z.literal("tasks.update"),
      leadId: z.string().transform(externalId),
      targetId: z.string().transform(externalId),
      content: z.string().trim().min(1).max(1000),
      endAt: z.iso.datetime({ offset: true }).optional(),
      expectedHash: z.string().regex(/^[a-f\d]{64}$/),
    })
    .strict(),
]);

export class LoftyProvider implements CrmProvider {
  readonly id = "lofty" as const;
  readonly capabilities = allCapabilities;
  cooldownUntil: string | null = null;
  constructor(
    private config: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    },
    private transport: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    token?: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    if (this.cooldownUntil && Date.parse(this.cooldownUntil) > Date.now())
      throw new ProviderError(
        "rate_limited",
        Math.ceil((Date.parse(this.cooldownUntil) - Date.now()) / 1000),
      );
    const oauth = path === "/api/user-web/oauth/token";
    let response: Response;
    try {
      response = await this.transport(
        `${oauth ? "https://crm.lofty.com" : "https://api.lofty.com"}${path}`,
        {
          method,
          headers: {
            "Content-Type": oauth
              ? "application/x-www-form-urlencoded"
              : "application/json",
            Authorization: oauth
              ? `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`
              : `Bearer ${token}`,
          },
          body:
            body === undefined
              ? undefined
              : oauth
                ? (body as URLSearchParams).toString()
                : JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      throw new ProviderError("network");
    }
    const retry = response.headers.get("retry-after");
    const retrySeconds =
      retry && /^\d+$/.test(retry)
        ? Number(retry)
        : retry
          ? (Date.parse(retry) - Date.now()) / 1000
          : 60;
    const wait = Math.min(
      3600,
      Math.max(
        60,
        Number.isFinite(retrySeconds) ? Math.ceil(retrySeconds) : 60,
      ),
    );
    if (
      response.status === 429 ||
      response.headers.get("x-ratelimit-remaining") === "0"
    )
      this.cooldownUntil = new Date(Date.now() + wait * 1000).toISOString();
    if (response.status === 429) throw new ProviderError("rate_limited", wait);
    if (response.status === 401) throw new ProviderError("unauthorized");
    if (response.status === 403) throw new ProviderError("permission");
    if (response.status === 404) throw new ProviderError("unavailable");
    let result: unknown;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let bytes = 0;
      const parts: Uint8Array[] = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 3 * 1024 * 1024) {
            await reader.cancel();
            throw new Error();
          }
          parts.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      result = parseProviderJson(Buffer.concat(parts).toString("utf8"));
    } catch {
      throw new ProviderError(response.ok ? "invalid_response" : "network");
    }
    const envelope =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Json)
        : {};
    const code = String(envelope.code ?? envelope.errorCode ?? "");
    if (code === "200100" || code === "20017")
      throw new ProviderError("permission");
    if (["20006", "20007"].includes(code))
      throw new ProviderError("unavailable");
    if (
      envelope.error === "invalid_grant" ||
      envelope.error === "invalid_token"
    )
      throw new ProviderError("unauthorized");
    if (
      !response.ok ||
      envelope.error ||
      (code && !["0", "200"].includes(code))
    )
      throw new ProviderError(response.status >= 500 ? "network" : "rejected");
    return result;
  }
  private async tokens(form: URLSearchParams): Promise<TokenSet> {
    const result = object(
      await this.request("/api/user-web/oauth/token", undefined, "POST", form),
    );
    const parsed = z
      .object({
        access_token: z.string().min(1).max(16384),
        refresh_token: z.string().min(1).max(16384),
        token_type: z.literal("Bearer"),
        scope: z.literal("openApi"),
        expires_in: z.number().int().positive().max(31_536_000),
      })
      .safeParse(result);
    if (!parsed.success) throw new ProviderError("invalid_response");
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: new Date(
        Date.now() + parsed.data.expires_in * 1000,
      ).toISOString(),
    };
  }
  exchange(code: string) {
    return this.tokens(
      new URLSearchParams({
        code,
        client_id: this.config.clientId,
        redirect_uri: this.config.callbackUrl,
        grant_type: "authorization_code",
      }),
    );
  }
  refresh(refreshToken: string) {
    return this.tokens(
      new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    );
  }
  async identity(token: string) {
    const row = object(await this.request("/v1.0/me", token));
    return {
      userId: id(row.memberUserId),
      teamId: id(row.teamId),
      label: [row.firstName, row.lastName]
        .filter((x) => typeof x === "string")
        .join(" ")
        .slice(0, 200),
      timezone: typeof row.timeZoneId === "string" ? row.timeZoneId : "UTC",
    };
  }
  async leads(token: string, userId: string, offset: number) {
    const row = object(
      await this.request(
        `/v1.0/leads?${new URLSearchParams({ assignedUserId: id(userId), offset: String(offset), limit: "100", sort: "CreateTime", desc: "false" })}`,
        token,
      ),
    );
    const items = array(row.leads).map((v) => mapRecord("lead", v));
    const meta = object(row._metadata ?? row.get_metadata);
    const total = Number(meta.total);
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      Number(meta.offset) !== offset ||
      items.length > 100 ||
      (items.length === 0 && total > offset)
    )
      throw new ProviderError("invalid_response");
    return {
      records: items,
      total,
      nextOffset: offset + items.length < total ? offset + items.length : null,
    };
  }
  async lead(token: string, leadId: string) {
    return mapRecord(
      "lead",
      await this.request(`/v1.0/leads/${id(leadId)}`, token),
    );
  }
  async related(
    token: string,
    kind: Exclude<RecordKind, "lead">,
    leadId: string,
  ) {
    const target = id(leadId);
    const paths = {
      note: `/v1.0/notes?leadId=${target}`,
      task: `/v2.0/tasks?leadId=${target}`,
      transaction: `/v1.0/leads/${target}/transactions`,
      activity: `/v2.0/leads/${target}/activities?limit=1000&offset=0&timeZoneCode=UTC`,
    };
    const result = await this.request(paths[kind], token);
    const items = array(
      kind === "transaction"
        ? result
        : object(result)[
            { note: "notes", task: "tasks", activity: "activities" }[
              kind as "note" | "task" | "activity"
            ]
          ],
    );
    if (items.length > 5000) throw new ProviderError("invalid_response");
    return {
      records: items.map((v) => mapRecord(kind, v, target)),
      complete: kind !== "activity" || items.length < 1000,
    };
  }
  async record(token: string, kind: "note" | "task", targetId: string) {
    const result = object(
      await this.request(
        `${kind === "note" ? "/v1.0/notes" : "/v2.0/tasks"}/${id(targetId)}`,
        token,
      ),
    );
    return mapRecord(kind, result[kind]);
  }
  async write(token: string, input: WriteProposal) {
    const proposal = proposalSchema.parse(input);
    if (proposal.operation === "notes.create") {
      const row = object(
        await this.request("/v1.0/notes", token, "POST", {
          leadId: proposal.leadId,
          content: proposal.content,
          isPin: false,
        }),
      );
      return { externalId: id(row.noteId) };
    }
    if (proposal.operation === "tasks.create") {
      const row = object(
        await this.request("/v2.0/tasks", token, "POST", {
          leadId: proposal.leadId,
          content: proposal.content,
          endAt: proposal.endAt,
          assignedRole: "Agent",
          type: "Other",
        }),
      );
      return { externalId: id(row.taskId) };
    }
    await this.request(`/v2.0/tasks/${proposal.targetId}`, token, "PUT", {
      content: proposal.content,
      ...(proposal.endAt ? { endAt: proposal.endAt } : {}),
    });
    return { externalId: proposal.targetId };
  }
}
