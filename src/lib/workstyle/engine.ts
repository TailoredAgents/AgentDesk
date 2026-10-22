import {
  PHOTO_GUIDANCE,
  REQUIRED_REVIEW,
  type Evidence,
  type Preferences,
  type Values,
  type WorkstyleContext,
  type Suggestion,
} from "./types";
import type { Agent } from "../types";
import type { WorkProductContent } from "../work-product-types";
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const greeting =
  /^(?:(?:dear|hello|hi|hey)\s+[^,\n!.]{1,50}[,!.\n]|good\s+(?:morning|afternoon|evening)[,!.\s])/i;
export function messageSignals(original: string, approved: string) {
  return {
    ...(words(original) >= 25 && words(approved) >= 6
      ? { shorter: words(approved) <= words(original) * 0.7 }
      : {}),
    ...(greeting.test(original.trim())
      ? { greetingRemoved: !greeting.test(approved.trim()) }
      : {}),
  };
}
export function documentSignals(
  original: WorkProductContent,
  approved: WorkProductContent,
) {
  const has = (value: WorkProductContent) =>
    value.sections.some(
      (s) =>
        s.kind === "general_guidance" &&
        s.items.some(
          (i) =>
            i.certainty === "general" &&
            i.text.trim().toLowerCase() === PHOTO_GUIDANCE.toLowerCase(),
        ),
    );
  return !has(original) ? { photoChecklistAdded: has(approved) } : {};
}
export function resolveWorkstyle(
  preferences: Preferences = {},
  mandatory: Values = {},
  requirements: string[] = [],
): WorkstyleContext {
  return {
    values: {
      ...Object.fromEntries(
        Object.entries(preferences).map(([k, v]) => [k, v!.value]),
      ),
      ...mandatory,
    },
    mandatory,
    requirements: [REQUIRED_REVIEW, ...requirements],
  };
}
export function effectiveMessageStyle(
  style: Agent["style"],
  context: WorkstyleContext | undefined,
  workflow: string,
): Agent["style"] {
  if (workflow !== "follow_up" || !context) return style;
  const v = context.values;
  return {
    ...style,
    ...(v.followupLength
      ? {
          length:
            v.followupLength === "concise"
              ? "Short and to the point"
              : "A little more detail",
        }
      : {}),
    ...(v.followupGreeting
      ? {
          greeting:
            v.followupGreeting === "none"
              ? "none"
              : "Use a simple first-name greeting",
        }
      : {}),
  };
}
export function detectPatterns(
  evidence: Evidence[],
  preferences: Preferences = {},
  mandatory: Values = {},
) {
  const rules: Array<Omit<Suggestion, "id" | "status" | "createdAt">> = [];
  const consider = (key: keyof Evidence["signals"], workflow: string) => {
    const all = evidence
      .filter(
        (e) => e.workflow === workflow && typeof e.signals[key] === "boolean",
      )
      .sort(
        (a, b) =>
          b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id),
      )
      .slice(0, 12);
    const yes = all.filter((e) => e.signals[key]);
    return {
      all,
      yes,
      eligible:
        yes.length >= 4 &&
        yes.length * 5 >= all.length * 4 &&
        new Set(yes.map((e) => e.contextKey)).size >= 2,
    };
  };
  const add = (
    rule: string,
    title: string,
    why: string,
    effect: string,
    proposed: Values,
    signal: ReturnType<typeof consider>,
  ) => {
    const clean = Object.fromEntries(
      Object.entries(proposed).filter(
        ([key]) => !(key in preferences) && !(key in mandatory),
      ),
    ) as Values;
    if (Object.keys(clean).length)
      rules.push({
        rule,
        title,
        why,
        effect,
        proposed: clean,
        evidenceIds: signal.yes.map((e) => e.id),
        supporting: signal.yes.length,
        considered: signal.all.length,
      });
  };
  const short = consider("shorter", "follow_up"),
    greet = consider("greetingRemoved", "follow_up");
  if (short.eligible || greet.eligible) {
    const signal = short.eligible ? short : greet;
    add(
      "followup_style",
      short.eligible
        ? "Make follow-ups more concise"
        : "Skip unnecessary follow-up greetings",
      `${short.eligible ? `${short.yes.length} of ${short.all.length} eligible approved follow-ups were shortened by at least 30%.` : ""}${greet.eligible ? ` ${greet.yes.length} of ${greet.all.length} messages with greetings had those greetings removed.` : ""}`.trim(),
      "New follow-up drafts and their rewrites use these choices. Formal documents and other communication types keep their own settings.",
      {
        ...(short.eligible ? { followupLength: "concise" } : {}),
        ...(greet.eligible ? { followupGreeting: "none" } : {}),
      },
      signal,
    );
    if (short.eligible && greet.eligible && rules.length)
      rules[rules.length - 1].evidenceIds = [
        ...new Set([...short.yes, ...greet.yes].map((e) => e.id)),
      ];
  }
  const photo = consider("photoChecklistAdded", "seller_preparation");
  if (photo.eligible)
    add(
      "seller_checklist",
      "Remember your photography preparation step",
      `${photo.yes.length} of ${photo.all.length} eligible approved seller packages added the same general checklist guidance.`,
      "New seller preparation packages include this as personal guidance, separate from recorded client plans.",
      { sellerPhotoChecklist: "include" },
      photo,
    );
  const briefing = consider("briefingRequested", "appointment_briefing");
  if (briefing.eligible)
    add(
      "briefing_shortcut",
      "Keep appointment preparation close at hand",
      `You requested briefings for ${briefing.yes.length} distinct appointments.`,
      "Today shows a shortcut for your next assigned appointment. Preparing and approving a draft remain explicit steps.",
      { briefingShortcut: "show" },
      briefing,
    );
  return rules;
}
export function applyDocumentWorkstyle(
  content: WorkProductContent,
  kind: string,
  context?: WorkstyleContext,
): WorkProductContent {
  if (
    kind !== "seller_preparation" ||
    context?.values.sellerPhotoChecklist !== "include"
  )
    return content;
  if (
    content.sections.some((s) => s.items.some((i) => i.text === PHOTO_GUIDANCE))
  )
    return content;
  const output = structuredClone(content);
  const section = {
    title: "Personal preparation guidance · not client facts",
    kind: "general_guidance" as const,
    items: [
      {
        text: PHOTO_GUIDANCE,
        sourceId: null,
        sourceQuote: null,
        certainty: "general" as const,
      },
    ],
  };
  if (output.sections.length < 8) output.sections.push(section);
  else {
    const target = output.sections.find(
      (s) => s.kind === "general_guidance" && s.items.length < 10,
    );
    if (!target)
      throw new Error(
        "The document has no room for approved preparation guidance. Prepare a shorter draft.",
      );
    target.title = section.title;
    target.items.push(section.items[0]);
  }
  return output;
}
