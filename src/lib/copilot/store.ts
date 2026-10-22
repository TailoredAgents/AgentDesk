import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db";
import { ApiError } from "../auth";
import type { Principal, Turn, ConversationState, PageContext } from "./types";
import type { ResponseInputItem } from "openai/resources/responses/responses";

export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const operationId = (turnId: string, index: number) => {
  const hex = hash([turnId, index]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
type Row = {
  state: Turn;
  checkpoint: ResponseInputItem[];
  request_hash: string;
  lease_until: string | null;
};
type Executor = Pick<Awaited<ReturnType<typeof getDatabase>>["db"], "execute">;
async function rows<T>(db: Executor, query: ReturnType<typeof sql>) {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}
const denied = () =>
  new ApiError(
    404,
    "This Copilot conversation is unavailable.",
    "copilot_not_found",
  );
async function owned(db: Executor, p: Principal, id: string) {
  const found = await rows<{ id: string; expires_at: string }>(
    db,
    sql`SELECT id, expires_at FROM copilot_conversations WHERE id=${id} AND workspace_id=${p.workspaceId} AND owner_id=${p.ownerId} AND agent_id=${p.agentId} AND expires_at>now() FOR UPDATE`,
  );
  if (!found[0]) throw denied();
  return found[0];
}
export async function conversation(p: Principal): Promise<ConversationState> {
  const { db } = await getDatabase();
  return db.transaction(async (tx) => {
    // Retention is absolute, not extended by reads. No expired chat reaches the model.
    await tx.execute(
      sql`DELETE FROM copilot_conversations WHERE expires_at <= now()`,
    );
    await tx.execute(
      sql`INSERT INTO copilot_conversations(id, workspace_id, owner_id, agent_id, expires_at) VALUES(${randomUUID()},${p.workspaceId},${p.ownerId},${p.agentId},now()+interval '14 days') ON CONFLICT(workspace_id,owner_id,agent_id) DO NOTHING`,
    );
    const [row] = await rows<{ id: string; expires_at: string }>(
      tx,
      sql`SELECT id,expires_at FROM copilot_conversations WHERE workspace_id=${p.workspaceId} AND owner_id=${p.ownerId} AND agent_id=${p.agentId} FOR UPDATE`,
    );
    const turns = await rows<Row>(
      tx,
      sql`SELECT state,lease_until FROM copilot_turns WHERE conversation_id=${row.id} ORDER BY created_at,id`,
    );
    return {
      id: row.id,
      expiresAt: new Date(row.expires_at).toISOString(),
      turns: turns.map((r) =>
        r.state.status === "running" &&
        new Date(r.lease_until || 0).getTime() < Date.now()
          ? {
              ...r.state,
              status: "failed" as const,
              error: "Processing stopped. Retry to recover any saved work.",
            }
          : r.state,
      ),
    };
  });
}
export async function forget(p: Principal, id: string) {
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await owned(tx, p, id);
    const active = await rows(
      tx,
      sql`SELECT id FROM copilot_turns WHERE conversation_id=${id} AND lease_until>now()`,
    );
    if (active.length)
      throw new ApiError(
        409,
        "Wait for the current request to finish before clearing this chat.",
      );
    await tx.execute(sql`DELETE FROM copilot_conversations WHERE id=${id}`);
  });
}
export async function claim(
  p: Principal,
  conversationId: string,
  id: string,
  text: string,
  context: PageContext,
) {
  const { db } = await getDatabase();
  return db.transaction(async (tx) => {
    await owned(tx, p, conversationId);
    const existing = await rows<Row>(
      tx,
      sql`SELECT state,checkpoint,request_hash,lease_until FROM copilot_turns WHERE id=${id} AND conversation_id=${conversationId}`,
    );
    const digest = hash({ text, context });
    if (existing[0] && existing[0].request_hash !== digest)
      throw new ApiError(
        409,
        "This retry belongs to different content. Start a new request.",
        "request_conflict",
      );
    if (existing[0]?.state.status === "completed")
      return {
        turn: existing[0].state,
        checkpoint: existing[0].checkpoint,
        token: null,
      };
    const busy = await rows(
      tx,
      sql`SELECT id FROM copilot_turns WHERE conversation_id=${conversationId} AND lease_until>now()`,
    );
    if (busy.length)
      throw new ApiError(
        409,
        "This chat is still processing. Its saved status will update here.",
        "copilot_busy",
      );
    const count = await rows<{ count: string }>(
      tx,
      sql`SELECT count(*) AS count FROM copilot_turns WHERE conversation_id=${conversationId}`,
    );
    if (!existing[0] && Number(count[0].count) >= 60)
      throw new ApiError(
        409,
        "This chat has reached its limit. Clear it to start a new conversation.",
      );
    const token = randomUUID();
    const turn: Turn = existing[0]?.state ?? {
      id,
      text,
      context,
      status: "running",
      mode: "live",
      reply: null,
      error: null,
      calls: [],
      usage: { inputTokens: 0, outputTokens: 0, providerCalls: 0 },
      durationMs: 0,
      createdAt: new Date().toISOString(),
    };
    turn.status = "running";
    turn.error = null;
    await tx
      .execute(
        sql`INSERT INTO copilot_turns(id,conversation_id,request_hash,state,lease_token,lease_until) VALUES(${id},${conversationId},${digest},${JSON.stringify(turn)}::jsonb,${token},now()+interval '180 seconds') ON CONFLICT(id) DO UPDATE SET state=excluded.state,lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE copilot_turns.conversation_id=excluded.conversation_id RETURNING id`,
      )
      .then((result) => {
        if (!(result as unknown as { rows: unknown[] }).rows.length)
          throw denied();
      });
    return { turn, checkpoint: existing[0]?.checkpoint ?? [], token };
  });
}
export async function checkpoint(
  p: Principal,
  conversationId: string,
  token: string,
  turn: Turn,
  input: ResponseInputItem[],
  finish = false,
) {
  const { db } = await getDatabase();
  await db.transaction(async (tx) => {
    await owned(tx, p, conversationId);
    const changed = await rows(
      tx,
      sql`UPDATE copilot_turns SET state=${JSON.stringify(turn)}::jsonb,checkpoint=${JSON.stringify(input)}::jsonb,lease_until=${finish ? null : sql`lease_until`} WHERE id=${turn.id} AND conversation_id=${conversationId} AND lease_token=${token} AND lease_until>now() RETURNING id`,
    );
    if (!changed.length)
      throw new ApiError(
        409,
        "This request lost its processing lease. Refresh to recover its saved work.",
        "copilot_lease",
      );
  });
}
