import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { SAMPLE_WORKSPACE_ID } from "../db/seed-data";
import { detectPatterns, messageSignals } from "./engine";
import { PHOTO_GUIDANCE, type Evidence } from "./types";
import * as s from "./schema";
export async function seedWorkstyle(tx: Pick<Database, "insert" | "select">) {
  const id = `sample:${SAMPLE_WORKSPACE_ID}:jordan`;
  const [prior] = await tx
    .select()
    .from(s.profiles)
    .where(eq(s.profiles.id, id));
  if (prior) return; // Never reintroduce examples after dismissal, forgetting or personal edits.
  await tx
    .insert(s.profiles)
    .values({
      id,
      workspaceId: SAMPLE_WORKSPACE_ID,
      agentId: "jordan",
      enabled: true,
    });
  const pairs = [
    [
      "Sarah",
      "I wanted to take a moment to follow up regarding your preparation checklist. Please let me know which items you would like to discuss, and we can review your questions together when convenient.",
      "Which checklist items would you like to review together?",
    ],
    [
      "Alex and Jamie",
      "I am reaching out to follow up on your home search preferences. When you have a moment, please let me know which home-office features matter most so we can keep those in mind.",
      "Which home-office features matter most for your search?",
    ],
    [
      "Sarah",
      "I wanted to check in with you about the preparation ideas we discussed. Please feel free to share any questions about the checklist, and we can talk through the items you are considering.",
      "Any questions about the preparation checklist? We can talk through them.",
    ],
    [
      "Alex and Jamie",
      "I am writing to follow up about your search priorities and would appreciate your thoughts. Please let me know whether you would like to discuss commute preferences alongside the office space you are considering.",
      "Would you like to review commute preferences alongside your office-space needs?",
    ],
  ];
  const examples: Evidence[] = pairs.map(([name, text, after], i) => {
    const before = `Dear ${name}, ${text}`;
    return {
      id: `ws-demo-message-${i}`,
      sourceKey: `saved-fictional-message-${i}`,
      contextKey: i % 2 ? "parkers" : "sarah",
      workflow: "follow_up",
      before,
      after,
      signals: messageSignals(before, after),
      recordedAt: `2026-10-${12 + i}T14:00:00Z`,
      fictional: true,
    };
  });
  for (let i = 0; i < 4; i++)
    examples.push({
      id: `ws-demo-checklist-${i}`,
      sourceKey: `saved-fictional-checklist-${i}`,
      contextKey: `fictional-past-listing-${i}`,
      workflow: "seller_preparation",
      before:
        "Saved fictional package: general cleaning and photography preparation ideas.",
      after: `Jordan's saved fictional addition: ${PHOTO_GUIDANCE}`,
      signals: { photoChecklistAdded: true },
      recordedAt: `2026-10-${10 + i}T15:00:00Z`,
      fictional: true,
    });
  await tx
    .insert(s.evidence)
    .values(examples.map((e) => ({ ...e, profileId: id })));
  const suggestions = detectPatterns(examples).map((c) => ({
    ...c,
    id: `ws-demo-${c.rule}`,
    profileId: id,
    status: "pending",
    createdAt: "2026-10-22T12:00:00Z",
  }));
  if (suggestions.length) await tx.insert(s.suggestions).values(suggestions);
}
