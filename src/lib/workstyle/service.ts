import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { ApiError } from "../auth";
import * as sample from "../db/schema";
import * as crm from "../crm/schema";
import * as s from "./schema";
import { detectPatterns, resolveWorkstyle } from "./engine";
import {
  preferenceOptions,
  type Scope,
  type Evidence,
  type Values,
  type Preferences,
  type PreferenceKey,
} from "./types";

export type Store = Pick<Database, "select" | "insert" | "update" | "delete">;
export const profileId = (scope: Scope) =>
  scope.kind === "sample"
    ? `sample:${scope.workspaceId}:${scope.agentId}`
    : `pilot:${scope.memberId}`;
const standardId = (scope: Scope) =>
  scope.kind === "sample"
    ? `sample:${scope.workspaceId}`
    : `pilot:${scope.brokerageId}`;
const now = () => new Date().toISOString();
const deny = () =>
  new ApiError(
    403,
    "This workstyle profile is not available to your account.",
    "workstyle_access_denied",
  );
const patchSchema = z
  .record(z.string(), z.string().nullable())
  .refine(
    (value) =>
      Object.entries(value).every(
        ([k, v]) =>
          Object.hasOwn(preferenceOptions, k) &&
          (v === null ||
            (
              preferenceOptions[k as PreferenceKey].values as readonly string[]
            ).includes(v)),
      ),
    "Choose a supported preference value.",
  );
export const workstyleCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      revision: z.number().int().nonnegative(),
      values: patchSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("suggestion"),
      revision: z.number().int().nonnegative(),
      id: z.string().max(100),
      decision: z.enum(["accept", "dismiss"]),
      values: patchSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("undo"),
      revision: z.number().int().nonnegative(),
      id: z.string().max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("learning"),
      revision: z.number().int().nonnegative(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("forget"),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);

async function authorize(tx: Store, scope: Scope, lock = false) {
  if (scope.kind === "sample") {
    let q = tx
      .select()
      .from(sample.workspaces)
      .where(
        and(
          eq(sample.workspaces.id, scope.workspaceId),
          eq(sample.workspaces.sample, true),
        ),
      );
    const [workspace] = lock ? await q.for("update") : await q;
    const [agent] = await tx
      .select()
      .from(sample.agents)
      .where(
        and(
          eq(sample.agents.id, scope.agentId),
          eq(sample.agents.workspaceId, scope.workspaceId),
        ),
      );
    if (!workspace || !agent) throw deny();
  } else {
    const q = tx
      .select()
      .from(crm.members)
      .where(
        and(
          eq(crm.members.id, scope.memberId),
          eq(crm.members.brokerageId, scope.brokerageId),
          eq(crm.members.active, true),
        ),
      );
    if (!(lock ? await q.for("update") : await q).length) throw deny();
  }
}
export async function ensureProfile(tx: Store, scope: Scope) {
  await tx
    .insert(s.profiles)
    .values({
      id: profileId(scope),
      ...(scope.kind === "sample"
        ? {
            workspaceId: scope.workspaceId,
            agentId: scope.agentId,
            enabled: true,
          }
        : { memberId: scope.memberId, enabled: false }),
    })
    .onConflictDoNothing();
  const [profile] = await tx
    .select()
    .from(s.profiles)
    .where(eq(s.profiles.id, profileId(scope)))
    .for("update");
  return profile;
}
export async function readWorkstyleContext(
  tx: Pick<Store, "select">,
  scope: Scope,
) {
  const [profile] = await tx
    .select()
    .from(s.profiles)
    .where(eq(s.profiles.id, profileId(scope)));
  const [standard] = await tx
    .select()
    .from(s.standards)
    .where(eq(s.standards.id, standardId(scope)));
  return resolveWorkstyle(
    profile?.preferences,
    standard?.locked,
    standard?.requirements,
  );
}
async function reconcile(
  tx: Store,
  scope: Scope,
  profile: typeof s.profiles.$inferSelect,
) {
  if (!profile.enabled) return;
  const records = await tx
    .select()
    .from(s.evidence)
    .where(eq(s.evidence.profileId, profile.id))
    .orderBy(desc(s.evidence.recordedAt))
    .limit(100);
  const context = await readWorkstyleContext(tx, scope);
  const candidates = detectPatterns(
    records as Evidence[],
    profile.preferences,
    context.mandatory,
  );
  const existing = await tx
    .select()
    .from(s.suggestions)
    .where(eq(s.suggestions.profileId, profile.id));
  for (const candidate of candidates) {
    const prior = existing.find((x) => x.rule === candidate.rule);
    if (prior && !["pending", "withdrawn"].includes(prior.status)) continue;
    if (prior)
      await tx
        .update(s.suggestions)
        .set({ ...candidate, status: "pending" })
        .where(eq(s.suggestions.id, prior.id));
    else
      await tx.insert(s.suggestions).values({
        ...candidate,
        id: randomUUID(),
        profileId: profile.id,
        status: "pending",
        createdAt: now(),
      });
  }
  for (const old of existing.filter(
    (x) => x.status === "pending" && !candidates.some((c) => c.rule === x.rule),
  ))
    await tx
      .update(s.suggestions)
      .set({ status: "withdrawn" })
      .where(eq(s.suggestions.id, old.id));
}
/** Called only by server-owned review/preparation transactions, never by a client evidence endpoint. */
export async function observe(
  tx: Store,
  scope: Scope,
  input: Omit<Evidence, "id" | "recordedAt" | "fictional"> & {
    fictional?: boolean;
    recordedAt?: string;
  },
) {
  await authorize(tx, scope);
  const profile = await ensureProfile(tx, scope);
  if (!profile.enabled || Object.keys(input.signals).length === 0) return;
  await tx
    .insert(s.evidence)
    .values({
      ...input,
      id: randomUUID(),
      profileId: profile.id,
      before: input.before.slice(0, 700),
      after: input.after.slice(0, 700),
      fictional: scope.kind === "sample",
      recordedAt: input.recordedAt || now(),
    })
    .onConflictDoNothing();
  const old = await tx
    .select({ id: s.evidence.id })
    .from(s.evidence)
    .where(eq(s.evidence.profileId, profile.id))
    .orderBy(desc(s.evidence.recordedAt), desc(s.evidence.id))
    .offset(100);
  if (old.length)
    await tx.delete(s.evidence).where(
      inArray(
        s.evidence.id,
        old.map((x) => x.id),
      ),
    );
  await reconcile(tx, scope, profile);
}
async function state(
  tx: Store,
  scope: Scope,
  profile: typeof s.profiles.$inferSelect,
) {
  const context = await readWorkstyleContext(tx, scope);
  const suggestions = await tx
    .select()
    .from(s.suggestions)
    .where(eq(s.suggestions.profileId, profile.id))
    .orderBy(desc(s.suggestions.createdAt));
  const evidence = await tx
    .select()
    .from(s.evidence)
    .where(eq(s.evidence.profileId, profile.id))
    .orderBy(desc(s.evidence.recordedAt))
    .limit(100);
  const history = await tx
    .select()
    .from(s.changes)
    .where(eq(s.changes.profileId, profile.id))
    .orderBy(desc(s.changes.createdAt), desc(s.changes.id))
    .limit(20);
  return {
    enabled: profile.enabled,
    revision: profile.revision,
    preferences: profile.preferences,
    context,
    suggestions,
    evidence,
    history,
    sample: scope.kind === "sample",
  };
}
export async function getWorkstyle(db: Database, scope: Scope) {
  return db.transaction(async (tx) => {
    await authorize(tx, scope, true);
    const profile = await ensureProfile(tx, scope);
    await reconcile(tx, scope, profile);
    return state(tx, scope, profile);
  });
}
export async function changeWorkstyle(
  db: Database,
  scope: Scope,
  input: unknown,
) {
  const command = workstyleCommand.parse(input);
  return db.transaction(async (tx) => {
    await authorize(tx, scope, true);
    const profile = await ensureProfile(tx, scope);
    if (profile.revision !== command.revision)
      throw new ApiError(
        409,
        "Your workstyle changed. Refresh before applying this change.",
        "workstyle_conflict",
      );
    let preferences = structuredClone(profile.preferences),
      enabled = profile.enabled;
    const context = await readWorkstyleContext(tx, scope);
    let values: Record<string, string | null> | undefined,
      suggestionId: string | undefined;
    let kind: string = command.action;
    if (command.action === "configure") values = command.values;
    if (command.action === "suggestion") {
      if (!profile.enabled)
        throw new ApiError(
          409,
          "Suggestions are disabled. Enable them before reviewing a suggestion.",
        );
      await reconcile(tx, scope, profile);
      const [suggestion] = await tx
        .select()
        .from(s.suggestions)
        .where(
          and(
            eq(s.suggestions.id, command.id),
            eq(s.suggestions.profileId, profile.id),
          ),
        );
      if (!suggestion || suggestion.status !== "pending")
        throw new ApiError(
          409,
          "This suggestion is no longer pending. Refresh to see its current state.",
        );
      suggestionId = suggestion.id;
      if (command.decision === "accept") {
        if (!command.values)
          throw new ApiError(
            400,
            "Review the exact proposed preferences before accepting.",
          );
        values = command.values;
        if (
          Object.keys(values).length !==
            Object.keys(suggestion.proposed).length ||
          Object.entries(values).some(
            ([k, v]) => !(k in suggestion.proposed) || v === null,
          )
        )
          throw new ApiError(
            400,
            "Customize only the preferences in this suggestion.",
          );
        kind = Object.entries(values).every(
          ([k, v]) => suggestion.proposed[k as PreferenceKey] === v,
        )
          ? "accepted_suggestion"
          : "customized_suggestion";
      } else kind = "dismissed_suggestion";
      await tx
        .update(s.suggestions)
        .set({
          status: command.decision === "dismiss" ? "dismissed" : "accepted",
        })
        .where(eq(s.suggestions.id, suggestion.id));
    }
    if (values) {
      for (const [key, value] of Object.entries(values)) {
        const k = key as PreferenceKey;
        if (scope.kind === "pilot" && k === "briefingShortcut")
          throw new ApiError(
            400,
            "The Today briefing shortcut belongs to the sample document workflow. It is not available in the CRM pilot.",
          );
        if (k in context.mandatory)
          throw new ApiError(
            409,
            "This preference is set by a brokerage standard and cannot be overridden.",
            "brokerage_standard",
          );
        if (value === null) delete preferences[k];
        else
          preferences[k] = {
            value,
            source: suggestionId ? "accepted_suggestion" : "configured",
            updatedAt: now(),
            ...(suggestionId ? { suggestionId } : {}),
          };
      }
    }
    if (command.action === "undo") {
      const [change] = await tx
        .select()
        .from(s.changes)
        .where(
          and(
            eq(s.changes.id, command.id),
            eq(s.changes.profileId, profile.id),
          ),
        );
      if (!change || change.undone)
        throw new ApiError(409, "This change cannot be undone again.");
      const keys = [
        ...new Set([
          ...Object.keys(change.before),
          ...Object.keys(change.after),
        ]),
      ] as PreferenceKey[];
      const altered = keys.filter(
        (k) =>
          JSON.stringify(change.before[k]) !== JSON.stringify(change.after[k]),
      );
      if (!altered.length)
        throw new ApiError(400, "This event did not change preferences.");
      for (const k of altered) {
        if (
          k in context.mandatory ||
          JSON.stringify(preferences[k]) !== JSON.stringify(change.after[k])
        )
          throw new ApiError(
            409,
            "A later change or brokerage standard affects this preference. Customize it instead.",
            "workstyle_conflict",
          );
        if (change.before[k]) preferences[k] = change.before[k];
        else delete preferences[k];
      }
      await tx
        .update(s.changes)
        .set({ undone: true })
        .where(eq(s.changes.id, change.id));
      if (change.suggestionId)
        await tx
          .update(s.suggestions)
          .set({ status: "undone" })
          .where(eq(s.suggestions.id, change.suggestionId));
    }
    if (command.action === "learning") enabled = command.enabled;
    if (command.action === "forget") {
      await tx.delete(s.evidence).where(eq(s.evidence.profileId, profile.id));
      // Keep decisions, without examples, to avoid resurfacing dismissed suggestions.
      await tx
        .update(s.suggestions)
        .set({ evidenceIds: [] })
        .where(eq(s.suggestions.profileId, profile.id));
      await tx
        .update(s.suggestions)
        .set({ status: "withdrawn" })
        .where(
          and(
            eq(s.suggestions.profileId, profile.id),
            eq(s.suggestions.status, "pending"),
          ),
        );
    }
    await tx.insert(s.changes).values({
      id: randomUUID(),
      profileId: profile.id,
      kind,
      before: profile.preferences,
      after: preferences,
      suggestionId,
      createdAt: now(),
    });
    const [saved] = await tx
      .update(s.profiles)
      .set({ preferences, enabled, revision: profile.revision + 1 })
      .where(eq(s.profiles.id, profile.id))
      .returning();
    if (scope.kind === "sample")
      await tx
        .update(sample.workspaces)
        .set({ revision: sql`${sample.workspaces.revision}+1` })
        .where(eq(sample.workspaces.id, scope.workspaceId));
    await reconcile(tx, scope, saved);
    return state(tx, scope, saved);
  });
}
export type WorkstyleState = Awaited<ReturnType<typeof getWorkstyle>>;

/** CRM access removal also removes behavioral excerpts that contain that CRM context. */
export async function forgetContext(
  tx: Store,
  scope: Scope,
  contextKey?: string,
) {
  const id = profileId(scope);
  const [profile] = await tx
    .select()
    .from(s.profiles)
    .where(eq(s.profiles.id, id))
    .for("update");
  if (!profile) return;
  await tx
    .delete(s.evidence)
    .where(
      contextKey
        ? and(
            eq(s.evidence.profileId, id),
            eq(s.evidence.contextKey, contextKey),
          )
        : eq(s.evidence.profileId, id),
    );
  const retained = new Set(
    (
      await tx
        .select({ id: s.evidence.id })
        .from(s.evidence)
        .where(eq(s.evidence.profileId, id))
    ).map((x) => x.id),
  );
  for (const suggestion of await tx
    .select()
    .from(s.suggestions)
    .where(eq(s.suggestions.profileId, id))) {
    const evidenceIds = suggestion.evidenceIds.filter((x) => retained.has(x));
    await tx
      .update(s.suggestions)
      .set({
        evidenceIds,
        ...(suggestion.status === "pending" ? { status: "withdrawn" } : {}),
      })
      .where(eq(s.suggestions.id, suggestion.id));
  }
  await reconcile(tx, scope, profile);
}
