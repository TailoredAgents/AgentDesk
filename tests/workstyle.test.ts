import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as postgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { migrateDatabase, type Database } from "../src/lib/db";
import * as tables from "../src/lib/db/schema";
import * as crm from "../src/lib/crm/schema";
import * as s from "../src/lib/workstyle/schema";
import {
  observe,
  getWorkstyle,
  changeWorkstyle,
  readWorkstyleContext,
  profileId,
  forgetContext,
} from "../src/lib/workstyle/service";
import {
  messageSignals,
  documentSignals,
  detectPatterns,
  effectiveMessageStyle,
  resolveWorkstyle,
  applyDocumentWorkstyle,
} from "../src/lib/workstyle/engine";
import {
  PHOTO_GUIDANCE,
  type Evidence,
  type Scope,
} from "../src/lib/workstyle/types";
import { buildProviderContext } from "../src/lib/ai-context";
import type { WorkProductContent } from "../src/lib/work-product-types";
let db: Database, close: () => Promise<void>;
const style = {
  tone: "Professional",
  length: "A little more detail",
  greeting: "Dear [name]",
  avoid: "",
  examples: "",
};
const original =
  "Dear Sarah, I wanted to take a moment to follow up regarding your preparation checklist and ask whether there are any items you would like to review together. Please let me know which questions you would like to discuss.";
const final =
  "Which preparation checklist items would you like to review together?";
before(async () => {
  const url = process.env.WORKSTYLE_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
    assert.match(parsed.pathname, /^\/agentdesk_test_workstyle[a-z0-9_]*$/);
    const pool = new Pool({ connectionString: url });
    db = postgres(pool, { schema: tables }) as unknown as Database;
    close = () => pool.end();
  } else {
    const client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema: tables }) as unknown as Database;
    close = () => client.close();
  }
  await migrateDatabase(db, url ? "postgresql" : "pglite");
  assert.equal((await db.select().from(s.profiles)).length, 0);
});
after(async () => close());
async function fixture(): Promise<Scope> {
  const id = randomUUID();
  await db
    .insert(tables.workspaces)
    .values({
      id,
      name: "Fictional isolated workstyle test",
      sample: true,
      referenceDate: "2026-10-23",
    });
  await db
    .insert(tables.agents)
    .values({
      id,
      workspaceId: id,
      name: "Test Agent",
      role: "Agent",
      initials: "TA",
      color: "#123456",
      email: "test@example.invalid",
      style,
    });
  return { kind: "sample", workspaceId: id, agentId: id };
}
function example(
  i: number,
  positive = true,
): Omit<Evidence, "id" | "recordedAt" | "fictional"> {
  return {
    sourceKey: `review-${i}`,
    contextKey: `relationship-${i % 2}`,
    workflow: "follow_up",
    before: original,
    after: positive ? final : original,
    signals: messageSignals(original, positive ? final : original),
  };
}
async function add(scope: Scope, count = 4) {
  for (let i = 0; i < count; i++)
    await db.transaction((tx) => observe(tx, scope, example(i)));
  return getWorkstyle(db, scope);
}
test("isolated edits and opposing examples cannot establish a preference", () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({
    ...example(i),
    id: String(i),
    recordedAt: `2026-10-${10 + i}T00:00:00Z`,
    fictional: false,
  }));
  assert.equal(detectPatterns(rows.slice(0, 1)).length, 0);
  assert.equal(detectPatterns(rows.slice(0, 2)).length, 0);
  assert.equal(detectPatterns(rows).length, 1);
  const opposing = [4, 5].map((i) => ({
    ...example(i, false),
    id: String(i),
    recordedAt: `2026-10-${10 + i}T00:00:00Z`,
    fictional: false,
  }));
  assert.equal(detectPatterns([...rows, ...opposing]).length, 0);
  assert.equal(
    detectPatterns(rows.map((r) => ({ ...r, contextKey: "same-client" })))
      .length,
    0,
  );
});
test("recorded duplicates and concurrent retries count once; one pattern is proposed", async () => {
  const scope = await fixture();
  await getWorkstyle(db, scope);
  await Promise.all(
    Array.from({ length: 5 }, () =>
      db.transaction((tx) => observe(tx, scope, example(0))),
    ),
  );
  let state = await getWorkstyle(db, scope);
  assert.equal(state.evidence.length, 1);
  assert.equal(state.suggestions.length, 0);
  for (let i = 1; i < 4; i++)
    await db.transaction((tx) => observe(tx, scope, example(i)));
  state = await getWorkstyle(db, scope);
  assert.equal(state.suggestions.length, 1);
  assert.equal(state.suggestions[0].supporting, 4);
  assert.deepEqual(state.suggestions[0].proposed, {
    followupLength: "concise",
    followupGreeting: "none",
  });
  assert.deepEqual(state.preferences, {});
});
test("acceptance changes only follow-up style, and undo restores the baseline", async () => {
  const scope = await fixture();
  let state = await add(scope);
  const suggestion = state.suggestions[0];
  state = await changeWorkstyle(db, scope, {
    action: "suggestion",
    id: suggestion.id,
    revision: state.revision,
    decision: "accept",
    values: suggestion.proposed,
  });
  assert.equal(state.preferences.followupLength?.source, "accepted_suggestion");
  assert.equal(
    effectiveMessageStyle(style, state.context, "follow_up").greeting,
    "none",
  );
  assert.deepEqual(
    effectiveMessageStyle(style, state.context, "conversation"),
    style,
  );
  assert.deepEqual(
    effectiveMessageStyle(style, state.context, "seller_preparation"),
    style,
  );
  const context = {
    agent: {
      id: "a",
      name: "Agent",
      email: "a@example.invalid",
      initials: "A",
      color: "#fff",
      role: "Agent",
      style,
      workstyle: state.context,
    },
    client: {
      id: "c",
      agentId: "a",
      name: "Client",
      email: "client@example.invalid",
      phone: "555",
      type: "Seller",
      notes: [],
    },
    property: null,
    transcript: "Actual recorded client statement.",
    approvedMessages: [],
    workflow: "follow_up" as const,
  };
  const provider = buildProviderContext(context);
  assert.equal(provider.agent.communicationStyle.greeting, "none");
  assert.equal(provider.source, context.transcript);
  assert.ok(!JSON.stringify(provider).includes("review-"));
  assert.ok(!JSON.stringify(provider).includes("client@example.invalid"));
  state = await changeWorkstyle(db, scope, {
    action: "undo",
    revision: state.revision,
    id: state.history[0].id,
  });
  assert.deepEqual(state.preferences, {});
  assert.equal(state.suggestions[0].status, "undone");
  assert.equal(
    (await getWorkstyle(db, scope)).suggestions.filter(
      (x) => x.status === "pending",
    ).length,
    0,
  );
});
test("customization is explicit; dismissal stays suppressed after new examples", async () => {
  const scope = await fixture();
  let state = await add(scope),
    suggestion = state.suggestions[0];
  state = await changeWorkstyle(db, scope, {
    action: "suggestion",
    id: suggestion.id,
    revision: state.revision,
    decision: "accept",
    values: { followupLength: "standard", followupGreeting: "first_name" },
  });
  assert.equal(state.context.values.followupLength, "standard");
  assert.equal(state.history[0].kind, "customized_suggestion");
  const other = await fixture();
  state = await add(other);
  suggestion = state.suggestions[0];
  state = await changeWorkstyle(db, other, {
    action: "suggestion",
    id: suggestion.id,
    revision: state.revision,
    decision: "dismiss",
  });
  await db.transaction((tx) => observe(tx, other, example(9)));
  state = await getWorkstyle(db, other);
  assert.equal(state.suggestions[0].status, "dismissed");
  assert.deepEqual(state.preferences, {});
});
test("disabling stops collection; forgetting removes excerpts without reactivating declined suggestions", async () => {
  const scope = await fixture();
  let state = await add(scope);
  state = await changeWorkstyle(db, scope, {
    action: "suggestion",
    id: state.suggestions[0].id,
    decision: "dismiss",
    revision: state.revision,
  });
  state = await changeWorkstyle(db, scope, {
    action: "learning",
    enabled: false,
    revision: state.revision,
  });
  await db.transaction((tx) => observe(tx, scope, example(8)));
  assert.equal((await getWorkstyle(db, scope)).evidence.length, 4);
  state = await changeWorkstyle(db, scope, {
    action: "forget",
    revision: state.revision,
  });
  assert.equal(state.evidence.length, 0);
  assert.equal(state.suggestions[0].status, "dismissed");
  assert.deepEqual(state.suggestions[0].evidenceIds, []);
});
test("new opposing examples withdraw a pending suggestion before approval", async () => {
  const scope = await fixture();
  let state = await add(scope);
  const suggestion = state.suggestions[0];
  for (const i of [6, 7])
    await db.transaction((tx) => observe(tx, scope, example(i, false)));
  await assert.rejects(
    changeWorkstyle(db, scope, {
      action: "suggestion",
      id: suggestion.id,
      decision: "accept",
      values: suggestion.proposed,
      revision: state.revision,
    }),
  );
  state = await getWorkstyle(db, scope);
  assert.equal(state.suggestions[0].status, "withdrawn");
});
test("acceptance cannot add a newly suggested setting that the user has not reviewed", async () => {
  const scope = await fixture();
  for (let i = 0; i < 4; i++) {
    const e = example(i);
    e.signals = { shorter: true };
    await db.transaction((tx) => observe(tx, scope, e));
  }
  const state = await getWorkstyle(db, scope),
    suggestion = state.suggestions[0];
  assert.deepEqual(suggestion.proposed, { followupLength: "concise" });
  for (let i = 4; i < 8; i++)
    await db.transaction((tx) => observe(tx, scope, example(i)));
  await assert.rejects(
    changeWorkstyle(db, scope, {
      action: "suggestion",
      id: suggestion.id,
      decision: "accept",
      values: suggestion.proposed,
      revision: state.revision,
    }),
  );
  assert.deepEqual((await getWorkstyle(db, scope)).preferences, {});
});
test("later edits and stale revisions prevent unsafe undo; removal restores defaults", async () => {
  const scope = await fixture();
  let state = await getWorkstyle(db, scope);
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { noteFormat: "bullets", briefingDetail: "concise" },
  });
  const prior = state.history[0];
  await assert.rejects(
    changeWorkstyle(db, scope, {
      action: "configure",
      revision: 0,
      values: { noteFormat: "paragraphs" },
    }),
  );
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { noteFormat: "paragraphs" },
  });
  await assert.rejects(
    changeWorkstyle(db, scope, {
      action: "undo",
      revision: state.revision,
      id: prior.id,
    }),
  );
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { noteFormat: null },
  });
  assert.equal(state.preferences.noteFormat, undefined);
  assert.equal(state.preferences.briefingDetail?.value, "concise");
});
test("sample profiles, real agents and brokerages remain separate; real learning starts off", async () => {
  const brokerageId = randomUUID(),
    otherBroker = randomUUID(),
    memberId = randomUUID(),
    otherMember = randomUUID();
  await db.insert(crm.brokerages).values([
    { id: brokerageId, name: "A", loftyTeamId: "1001" },
    { id: otherBroker, name: "B", loftyTeamId: "1002" },
  ]);
  await db.insert(crm.members).values([
    {
      id: memberId,
      brokerageId,
      subject: `google:${memberId}`,
      label: "Agent A",
      loftyUserId: "2001",
      role: "leader",
    },
    {
      id: otherMember,
      brokerageId: otherBroker,
      subject: `google:${otherMember}`,
      label: "Agent B",
      loftyUserId: "2002",
      role: "agent",
    },
  ]);
  const scope: Scope = { kind: "pilot", memberId, brokerageId },
    other: Scope = {
      kind: "pilot",
      memberId: otherMember,
      brokerageId: otherBroker,
    };
  let state = await getWorkstyle(db, scope);
  assert.equal(state.enabled, false);
  await db.transaction((tx) => observe(tx, scope, example(0)));
  assert.equal((await getWorkstyle(db, scope)).evidence.length, 0);
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { followupLength: "concise" },
  });
  assert.deepEqual((await getWorkstyle(db, other)).preferences, {});
  await assert.rejects(
    getWorkstyle(db, { ...scope, brokerageId: otherBroker }),
  );
  await assert.rejects(
    changeWorkstyle(db, other, {
      action: "undo",
      revision: 0,
      id: state.history[0].id,
    }),
  );
  const fakeSample = await fixture();
  assert.deepEqual((await getWorkstyle(db, fakeSample)).preferences, {});
  await db
    .update(crm.members)
    .set({ active: false })
    .where(eq(crm.members.id, memberId));
  await assert.rejects(getWorkstyle(db, scope));
});
test("mandatory brokerage choices override personal choices and cannot be mutated through the profile", async () => {
  const scope = await fixture();
  assert.equal(scope.kind, "sample");
  if (scope.kind !== "sample") return;
  let state = await getWorkstyle(db, scope);
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { followupGreeting: "none" },
  });
  await db
    .insert(s.standards)
    .values({
      id: `sample:${scope.workspaceId}`,
      workspaceId: scope.workspaceId,
      locked: { followupGreeting: "first_name" },
      requirements: ["Retain the brokerage's required review steps."],
    });
  state = await getWorkstyle(db, scope);
  assert.equal(state.context.values.followupGreeting, "first_name");
  assert.equal(state.preferences.followupGreeting?.value, "none");
  await assert.rejects(
    changeWorkstyle(db, scope, {
      action: "configure",
      revision: state.revision,
      values: { followupGreeting: "none" },
    }),
  );
  assert.equal(
    (
      await db
        .select()
        .from(s.standards)
        .where(eq(s.standards.id, `sample:${scope.workspaceId}`))
    )[0].locked.followupGreeting,
    "first_name",
  );
});
test("checklist additions need repeated distinct packages and become guidance only in seller documents", async () => {
  const base: WorkProductContent = {
    title: "Seller preparation",
    introduction: "Review these optional preparation ideas.",
    sections: [
      {
        title: "Optional preparation",
        kind: "general_guidance",
        items: [
          {
            text: "Consider reducing clutter.",
            sourceId: null,
            sourceQuote: null,
            certainty: "general",
          },
        ],
      },
      {
        title: "Discussion points",
        kind: "general_guidance",
        items: [
          {
            text: "Discuss any questions together.",
            sourceId: null,
            sourceQuote: null,
            certainty: "general",
          },
        ],
      },
    ],
  };
  const context = resolveWorkstyle({
    sellerPhotoChecklist: {
      value: "include",
      source: "configured",
      updatedAt: new Date().toISOString(),
    },
  });
  const applied = applyDocumentWorkstyle(base, "seller_preparation", context);
  assert.deepEqual(
    applyDocumentWorkstyle(base, "appointment_briefing", context),
    base,
  );
  assert.deepEqual(
    applyDocumentWorkstyle(applied, "seller_preparation", context),
    applied,
  );
  const item = applied.sections.at(-1)!.items[0];
  assert.equal(item.text, PHOTO_GUIDANCE);
  assert.equal(item.certainty, "general");
  assert.equal(item.sourceId, null);
  assert.equal(item.sourceQuote, null);
  assert.equal(documentSignals(base, applied).photoChecklistAdded, true);
  const scope = await fixture();
  for (let i = 0; i < 4; i++)
    await db.transaction((tx) =>
      observe(tx, scope, {
        ...example(i),
        sourceKey: `seller-${i}`,
        contextKey: `listing-${i}`,
        workflow: "seller_preparation",
        signals: documentSignals(base, applied),
      }),
    );
  const state = await getWorkstyle(db, scope);
  assert.equal(state.suggestions[0].rule, "seller_checklist");
  assert.deepEqual(state.preferences, {});
});
test("repeated briefing requests suggest a shortcut, never automatic work", async () => {
  const scope = await fixture();
  for (let i = 0; i < 4; i++)
    await db.transaction((tx) =>
      observe(tx, scope, {
        ...example(i),
        sourceKey: `briefing-${i}`,
        contextKey: `appointment-${i}`,
        workflow: "appointment_briefing",
        signals: { briefingRequested: true },
      }),
    );
  let state = await getWorkstyle(db, scope);
  const suggestion = state.suggestions[0];
  assert.equal(suggestion.rule, "briefing_shortcut");
  assert.match(suggestion.effect, /explicit steps/);
  state = await changeWorkstyle(db, scope, {
    action: "suggestion",
    id: suggestion.id,
    decision: "accept",
    values: suggestion.proposed,
    revision: state.revision,
  });
  assert.equal(state.context.values.briefingShortcut, "show");
  assert.equal((await db.select().from(tables.workProducts)).length, 0);
});
test("removing CRM context clears behavioral excerpts but retains approved formatting preferences", async () => {
  const scope = await fixture();
  let state = await add(scope);
  state = await changeWorkstyle(db, scope, {
    action: "configure",
    revision: state.revision,
    values: { noteFormat: "bullets" },
  });
  await db.transaction((tx) => forgetContext(tx, scope));
  state = await getWorkstyle(db, scope);
  assert.equal(state.evidence.length, 0);
  assert.equal(state.preferences.noteFormat?.value, "bullets");
  assert.equal(
    state.suggestions.filter((x) => x.status === "pending").length,
    0,
  );
  assert.deepEqual((await readWorkstyleContext(db, scope)).values, {
    noteFormat: "bullets",
  });
});
