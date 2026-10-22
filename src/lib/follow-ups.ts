import type { FollowUpRecommendation, WorkspaceData } from "./types";

type FollowUpData = Pick<
  WorkspaceData,
  | "workspace"
  | "clients"
  | "properties"
  | "tasks"
  | "commitments"
  | "appointments"
  | "conversations"
  | "packages"
>;
export const recommendationIdFor = (
  agentId: string,
  clientId: string,
  propertyId: string | null,
  signalIds: string[] = [],
) => {
  let hash = 2166136261;
  for (const character of [...signalIds].sort().join("|"))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `followup:${agentId}:${clientId}:${propertyId || "relationship"}:${(hash >>> 0).toString(16)}`;
};
const relationshipWork =
  /follow[ -]?up|check[ -]?in|contact|call|send|share|confirm.*(?:photograph|availability|with)|(?:tour|showing).*feedback|feedback.*(?:tour|showing)|client.*question/i;

/** Observable open work determines urgency. Elapsed silence alone never creates a recommendation. */
export function deriveFollowUps(data: FollowUpData): FollowUpRecommendation[] {
  const today = data.workspace.referenceDate;
  const groups = new Map<
    string,
    {
      agentId: string;
      clientId: string;
      propertyId: string | null;
      taskIds: string[];
      commitmentIds: string[];
    }
  >();
  const add = (
    agentId: string,
    clientId: string,
    propertyId: string | null,
  ) => {
    const id = recommendationIdFor(agentId, clientId, propertyId);
    if (!groups.has(id))
      groups.set(id, {
        agentId,
        clientId,
        propertyId,
        taskIds: [],
        commitmentIds: [],
      });
    return groups.get(id)!;
  };
  for (const commitment of data.commitments) {
    if (commitment.status !== "open") continue;
    add(
      commitment.agentId,
      commitment.clientId,
      commitment.propertyId,
    ).commitmentIds.push(commitment.id);
  }
  for (const task of data.tasks) {
    if (
      task.status !== "open" ||
      !task.clientId ||
      task.reviewPackageId ||
      !relationshipWork.test(`${task.title} ${task.detail}`)
    )
      continue;
    add(task.agentId, task.clientId, task.propertyId).taskIds.push(task.id);
  }
  const results: FollowUpRecommendation[] = [];
  for (const group of groups.values()) {
    const client = data.clients.find(
      (item) => item.id === group.clientId && item.agentId === group.agentId,
    );
    if (!client) continue;
    const property = group.propertyId
      ? data.properties.find(
          (item) =>
            item.id === group.propertyId &&
            item.clientId === client.id &&
            item.agentId === group.agentId,
        )
      : null;
    if (group.propertyId && !property) continue;
    const tasks = data.tasks
      .filter((task) => group.taskIds.includes(task.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const commitments = data.commitments
      .filter((item) => group.commitmentIds.includes(item.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const signalIds = [
      ...group.taskIds.map((id) => `task:${id}`),
      ...group.commitmentIds.map((id) => `commitment:${id}`),
    ].sort();
    const dates = [
      ...tasks.map((task) => task.dueDate),
      ...commitments.map((item) => item.dueDate),
    ]
      .filter((value): value is string => Boolean(value))
      .sort();
    const dueDate = dates[0] ?? null;
    const urgency = dueDate
      ? dueDate < today
        ? "overdue"
        : dueDate === today
          ? "due"
          : "upcoming"
      : "unresolved";
    const question = commitments.find((item) => item.kind === "question");
    const title = question
      ? "Client question awaiting resolution"
      : urgency === "overdue"
        ? "Follow-up overdue"
        : urgency === "due"
          ? "Follow-up due"
          : "Outstanding follow-up";
    const evidence = [
      ...commitments.map(
        (item) =>
          `${item.title}: ${item.detail} Open ${item.kind === "question" ? "question" : "commitment"}${item.dueDate ? `; due ${item.dueDate}` : "; no due date recorded"}. Source: “${item.sourceQuote}”`,
      ),
      ...tasks.map(
        (task) =>
          `Open task: ${task.title}. ${task.detail}${task.dueDate ? ` Due ${task.dueDate}.` : " No due date recorded."}`,
      ),
    ];
    const appointments = data.appointments.filter(
      (item) =>
        item.agentId === group.agentId &&
        item.clientId === group.clientId &&
        (!group.propertyId || item.propertyId === group.propertyId),
    );
    const conversations = data.conversations
      .filter(
        (item) =>
          item.agentId === group.agentId &&
          item.clientId === group.clientId &&
          (!group.propertyId || item.propertyId === group.propertyId) &&
          item.source !== "followup",
      )
      .slice(0, 3);
    const pkg = data.packages.find((item) => {
      if (
        !item.recommendationId ||
        item.agentId !== group.agentId ||
        item.clientId !== group.clientId ||
        item.propertyId !== group.propertyId
      )
        return false;
      const covered = new Set([
        ...(item.signalIds || []),
        ...tasks
          .filter((task) =>
            item.actions.some((action) => action.id === task.sourceActionId),
          )
          .map((task) => `task:${task.id}`),
        ...commitments
          .filter((commitment) =>
            item.actions.some(
              (action) => action.id === commitment.sourceActionId,
            ),
          )
          .map((commitment) => `commitment:${commitment.id}`),
      ]);
      return signalIds.every((signal) => covered.has(signal));
    });
    const id =
      pkg?.recommendationId ||
      recommendationIdFor(
        group.agentId,
        group.clientId,
        group.propertyId,
        signalIds,
      );
    const status = pkg
      ? pkg.status === "pending"
        ? "ready_for_review"
        : pkg.actions.some(
              (action) =>
                action.kind === "message" && action.status === "approved",
            )
          ? "approved_draft"
          : "reviewed"
      : "needs_draft";
    const uncertainties = [
      ...commitments
        .filter((item) => item.kind === "dependency")
        .map((item) => item.detail),
      ...(dueDate
        ? []
        : [
            "No follow-up due date is recorded; urgency is not inferred from inactivity.",
          ]),
    ];
    const reason = `${commitments[0]?.title || tasks[0]?.title}${dueDate ? ` — ${dueDate < today ? "due" : "target"} ${dueDate}` : " — still unresolved"}. ${status === "approved_draft" ? "An approved draft is saved, but the underlying work is still open; no message was sent." : "No completion is recorded for this open work."}`;
    const sourceSnapshot = [
      `Workspace reference date: ${today}. Dataset revision: ${data.workspace.revision ?? 0}. Client: ${client.name}. Agent: ${group.agentId}.`,
      property
        ? `Related property: ${property.address}. Stage: ${property.stage}.`
        : "No property is linked to this relationship follow-up.",
      "OPEN WORK EVIDENCE",
      ...evidence,
      "AUTHORIZED CLIENT NOTES",
      ...client.notes,
      ...(property
        ? [
            "LISTING NOTES",
            ...property.notes,
            ...(property.targetDate
              ? [
                  `Recorded listing target: ${property.targetDate}; a target is not a confirmed appointment.`,
                ]
              : []),
          ]
        : []),
      "RECORDED APPOINTMENTS",
      ...appointments.map(
        (item) =>
          `${item.title}; ${item.startsAt}; ${item.status}. ${item.briefing}`,
      ),
      "CONVERSATION EXCERPTS",
      ...conversations.map(
        (item) =>
          `${item.title} (${item.createdAt}): ${item.transcript.slice(0, 7000)}`,
      ),
      "No message delivery is connected. Approval saves a draft; it does not complete a follow-up commitment.",
    ]
      .join("\n")
      .slice(0, 39_000);
    results.push({
      id,
      ...group,
      title,
      reason,
      urgency,
      dueDate,
      evidence,
      sourceSnapshot,
      packageId: pkg?.id ?? null,
      status,
      uncertainties,
    });
  }
  const rank = { overdue: 0, due: 1, unresolved: 2, upcoming: 3 };
  return results.sort(
    (left, right) =>
      rank[left.urgency] - rank[right.urgency] ||
      (left.dueDate || "9999").localeCompare(right.dueDate || "9999") ||
      left.id.localeCompare(right.id),
  );
}
