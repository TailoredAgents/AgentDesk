import type { Decision, ProposedAction, ReviewInput } from "@/lib/types";

/** Undecided proposals never become a mutation merely because they are visible. */
export function selectedReviewDecisions(
  actions: ProposedAction[],
  choices: Record<string, Decision>,
  edits: Record<string, string>,
  dates: Record<string, string>,
): ReviewInput["decisions"] {
  return actions.flatMap((action) => {
    const status = choices[action.id];
    if (action.status !== "pending" || !status || status === "pending")
      return [];
    return [
      {
        id: action.id,
        status,
        body: (edits[action.id] ?? action.body).trim(),
        dueDate: action.id in dates ? dates[action.id] || null : action.dueDate,
      },
    ];
  });
}

export function reviewEffect(
  action: ProposedAction,
  propertyLinked: boolean,
): string {
  switch (action.kind) {
    case "summary":
      return "Update the package summary";
    case "crm_note":
      return "Save a note to the client’s AgentDesk record";
    case "message":
      return "Save an approved client message draft; do not send";
    case "task":
      return propertyLinked
        ? "Create an open task linked to this client and listing"
        : "Create an open task linked to this client";
    case "listing_update":
      return "Add a note to the linked listing; do not change its stage";
  }
}
