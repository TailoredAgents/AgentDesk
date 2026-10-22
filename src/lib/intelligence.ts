import type { ProposedAction, WorkspaceData } from "./types";
import {
  topicLabels,
  type ClientFact,
  type Observation,
  type IntelligenceChange,
  type SituationImpact,
} from "./intelligence-types";

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export const topicPatterns: Record<Observation["topic"], RegExp> = {
  objective: /\b(sell|selling|buy|buying|move|moving|relocat|home search)/i,
  communication: /\b(text|texts|email|call|updates|messages|contact)\b/i,
  buyer_priority:
    /\b(bedrooms?|bathrooms?|budget|garage|yard|commute|home|house|condo)\b/i,
  cleaning: /\b(cleaning|cleaner|cleaners|clean)\b/i,
  photography: /\b(photos?|photograph\w*|pictures)\b/i,
  staging: /\b(staging|stager|stage)\b/i,
  listing_launch: /\b(listing|launch|list|market)\b/i,
};
export function sameRelationship(
  a: { agentId: string; clientId: string | null; propertyId: string | null },
  b: { agentId: string; clientId: string | null; propertyId: string | null },
) {
  return (
    a.agentId === b.agentId &&
    a.clientId === b.clientId &&
    a.propertyId === b.propertyId
  );
}
export function currentFacts(
  data: WorkspaceData,
  scope: { agentId: string; clientId: string; propertyId: string | null },
) {
  return (data.clientFacts ?? []).filter(
    (f) =>
      f.status === "current" &&
      f.agentId === scope.agentId &&
      f.clientId === scope.clientId &&
      (f.propertyId === scope.propertyId || f.propertyId === null),
  );
}
const timing = (value: string) =>
  (
    normalize(value).match(
      /\b(?:morning|afternoon|evening|noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/g,
    ) ?? []
  )
    .sort()
    .join("|");
export function compareObservation(
  observation: Observation,
  before: ClientFact[],
): IntelligenceChange | null {
  if (
    before.some(
      (f) =>
        f.certainty === observation.certainty &&
        (normalize(f.value) === normalize(observation.value) ||
          (observation.effectiveDate &&
            observation.effectiveDate === f.effectiveDate &&
            timing(observation.value) === timing(f.value))),
    )
  )
    return null;
  if (!before.length)
    return { type: "fact", observation, disposition: "new", before };
  const confirmed = before.some((f) => f.certainty === "confirmed");
  const explicitlyReplaced =
    observation.intent === "replacement" &&
    /\b(reschedul\w*|moved|changed|instead|no longer|won['’]t work|replac\w*|correction)\b/i.test(
      observation.sourceQuote,
    );
  const disposition =
    confirmed && observation.certainty !== "confirmed"
      ? observation.certainty === "requested"
        ? "request"
        : "conflict"
      : explicitlyReplaced
        ? "replace"
        : "conflict";
  return { type: "fact", observation, disposition, before };
}
export function prepareIntelligenceActions(
  data: WorkspaceData,
  scope: { agentId: string; clientId: string; propertyId: string | null },
  observations: Observation[],
  makeId: () => string,
): ProposedAction[] {
  const facts = currentFacts(data, scope);
  const result: ProposedAction[] = [];
  for (const o of observations) {
    const relationship = {
      ...scope,
      propertyId: factProperty(o.topic, scope.propertyId),
    };
    if (
      !relationship.propertyId &&
      !["objective", "communication", "buyer_priority"].includes(o.topic)
    )
      continue;
    const before = facts.filter(
      (f) => f.topic === o.topic && f.propertyId === relationship.propertyId,
    );
    if (
      (data.clientFacts ?? []).some(
        (f) =>
          sameRelationship(f, relationship) &&
          f.topic === o.topic &&
          f.status !== "current" &&
          normalize(f.sourceQuote) === normalize(o.sourceQuote),
      )
    )
      continue;
    const change = compareObservation(o, before);
    if (
      !change ||
      result.some(
        (a) =>
          a.change?.type === "fact" && a.change.observation.topic === o.topic,
      )
    )
      continue;
    const duplicate = data.packages
      .filter(
        (p) =>
          p.agentId === scope.agentId &&
          p.clientId === scope.clientId &&
          p.propertyId === scope.propertyId,
      )
      .some((p) =>
        p.actions.some(
          (a) =>
            a.status !== "rejected" &&
            a.change?.type === "fact" &&
            a.change.observation.topic === o.topic &&
            normalize(a.change.observation.value) === normalize(o.value),
        ),
      );
    if (duplicate) continue;
    const title = `${topicLabels[o.topic]} · ${change.disposition === "replace" ? "changed plan" : change.disposition === "conflict" ? "clarification needed" : change.disposition === "request" ? "requested change" : "new information"}`;
    result.push({
      id: makeId(),
      kind: "intelligence",
      title,
      body: o.value,
      status: "pending",
      dueDate: o.effectiveDate,
      sourceQuote: o.sourceQuote,
      certainty: o.certainty,
      change,
      original: { title, body: o.value, dueDate: o.effectiveDate },
      originalAvailable: true,
    });
  }
  return result;
}
export function factProperty(
  topic: Observation["topic"],
  propertyId: string | null,
) {
  return ["communication", "buyer_priority"].includes(topic)
    ? null
    : propertyId;
}
function dateAliases(date: string | null) {
  if (!date) return [];
  const d = new Date(`${date}T12:00:00Z`);
  return [
    date,
    d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }),
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  ].map(normalize);
}
export function mentionsFact(text: string, fact: ClientFact) {
  const n = normalize(text);
  const dated = dateAliases(fact.effectiveDate).some((date) =>
    new RegExp(`\\b${date}(?!\\d)`).test(n),
  );
  const hasExplicitDate =
    /\b20\d{2}-\d{2}-\d{2}|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(
      text,
    );
  const weekdayOnly =
    fact.effectiveDate &&
    !hasExplicitDate &&
    n.includes(
      new Date(`${fact.effectiveDate}T12:00:00Z`)
        .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
        .toLowerCase(),
    );
  return (
    n.includes(normalize(fact.value)) ||
    (topicPatterns[fact.topic].test(text) && Boolean(dated || weekdayOnly))
  );
}
/** Remove obsolete claims before constructing any provider context. Audit sources stay intact. */
export function currentContextText(text: string, facts: ClientFact[]) {
  const obsolete = facts.filter((f) => f.status !== "current");
  const lines = text.split(/(?<=[.!?])\s+|\n/);
  const current = lines.filter(
    (line) =>
      !obsolete.some(
        (f) =>
          mentionsFact(line, f) ||
          (!f.effectiveDate && topicPatterns[f.topic].test(line)),
      ),
  );
  return current.length === lines.length ? text : current.join("\n");
}
export function impactsForChange(
  data: WorkspaceData,
  next: ClientFact,
  previous: ClientFact[],
): SituationImpact[] {
  const impacts: SituationImpact[] = [];
  const scoped = (row: {
    agentId: string;
    clientId: string | null;
    propertyId: string | null;
  }) => sameRelationship(row, next);
  for (const old of previous) {
    const add = (
      kind: SituationImpact["kind"],
      targetId: string,
      title: string,
      detail: string,
      extra = {},
    ) =>
      impacts.push({
        id: `${next.id}:${old.id}:${kind}:${targetId}:${JSON.stringify(extra)}`,
        kind,
        targetId,
        title,
        detail,
        agentId: next.agentId,
        clientId: next.clientId,
        propertyId: next.propertyId,
        factId: next.id,
        previousFactId: old.id,
        ...extra,
      });
    for (const task of data.tasks.filter(
      (t) => scoped(t) && t.status === "open" && !t.reviewPackageId,
    )) {
      if (
        mentionsFact(`${task.title} ${task.detail}`, old) ||
        (topicPatterns[old.topic].test(`${task.title} ${task.detail}`) &&
          old.effectiveDate &&
          task.dueDate === old.effectiveDate)
      )
        add(
          "task",
          task.id,
          task.title,
          "This open task still refers to the previous plan. Review its instructions and any calendar time.",
        );
      else if (
        next.topic === "cleaning" &&
        next.effectiveDate &&
        /(?:photo(?:graphy)? (?:session|shoot)|take (?:photos|pictures))/.test(
          task.title.toLowerCase(),
        ) &&
        task.dueDate &&
        task.dueDate < next.effectiveDate
      )
        add(
          "task",
          task.id,
          task.title,
          "Photography work is due before the newly recorded cleaning date. Check this dependency.",
        );
    }
    for (const a of data.appointments.filter(scoped))
      if (
        mentionsFact(`${a.title} ${a.briefing}`, old) ||
        (topicPatterns[old.topic].test(a.title) &&
          a.startsAt.slice(0, 10) === old.effectiveDate)
      )
        add(
          "appointment",
          a.id,
          a.title,
          "The appointment’s briefing or schedule refers to the previous plan. Review it before the appointment; its booked time has not changed.",
        );
    for (const c of data.commitments.filter(
      (c) => scoped(c) && c.status === "open",
    ))
      if (mentionsFact(`${c.title} ${c.detail}`, old))
        add(
          "commitment",
          c.id,
          c.title,
          "Review this outstanding commitment against the updated plan.",
        );
    for (const p of data.packages.filter(scoped))
      for (const a of p.actions.filter(
        (a) => a.kind === "message" && a.status === "approved",
      ))
        if (mentionsFact(a.body, old))
          add(
            "message",
            a.id,
            a.title,
            "This saved draft contains previous information. Review before copying or sending.",
          );
    for (const p of data.workProducts.filter(scoped))
      for (const v of p.versions.filter((v) => v.status !== "rejected")) {
        for (const section of v.content.sections)
          if (section.items.some((item) => mentionsFact(item.text, old)))
            add(
              "document",
              p.id,
              v.content.title,
              `${topicLabels[old.topic]} · Version ${v.version}: “${section.title}” contains previous information. The original PDF is preserved.`,
              { versionId: v.id, section: section.title },
            );
      }
  }
  return impacts;
}
export function situationImpacts(data: WorkspaceData) {
  const facts = data.clientFacts ?? [];
  return facts
    .filter(
      (f) =>
        f.status === "current" ||
        (f.status === "retired" && f.supersedes.length),
    )
    .flatMap((f) => impactsForChange(data, f, previousFacts(f, facts)));
}
/** Historical warnings stay on their records; a reviewed replacement clears the operational queue. */
export function activeSituationImpacts(data: WorkspaceData) {
  const impacts = situationImpacts(data);
  return impacts.filter((impact) => {
    if (impact.kind === "document") {
      const product = data.workProducts.find((p) => p.id === impact.targetId);
      const old = product?.versions.find((v) => v.id === impact.versionId);
      if (
        old &&
        product?.versions.some(
          (v) =>
            v.status === "approved" &&
            v.version > old.version &&
            !impacts.some((i) => i.versionId === v.id),
        )
      )
        return false;
    }
    if (impact.kind === "message") {
      const next = data.clientFacts?.find((f) => f.id === impact.factId);
      if (
        next &&
        data.packages.some(
          (p) =>
            sameRelationship(p, next) &&
            p.actions.some(
              (a) =>
                a.kind === "message" &&
                a.status === "approved" &&
                a.id !== impact.targetId &&
                mentionsFact(a.body, next) &&
                !impacts.some((i) => i.targetId === a.id),
            ),
        )
      )
        return false;
    }
    return true;
  });
}
export function previousFacts(fact: ClientFact, facts: ClientFact[]) {
  const seen = new Set<string>();
  const visit = (ids: string[]) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      const old = facts.find((f) => f.id === id && sameRelationship(f, fact));
      if (old) {
        seen.add(id);
        visit(old.supersedes);
      }
    }
  };
  visit(fact.supersedes);
  return facts.filter((f) => seen.has(f.id));
}
export function proposalImpacts(
  data: WorkspaceData,
  action: ProposedAction,
  scope: { agentId: string; clientId: string; propertyId: string | null },
) {
  if (action.change?.type !== "fact") return [];
  const c = action.change;
  if (c.disposition !== "replace") return [];
  return impactsForChange(
    data,
    {
      id: action.id,
      ...scope,
      ...c.observation,
      propertyId: factProperty(c.observation.topic, scope.propertyId),
      status: "current",
      recordedAt: "",
      reviewedAt: "",
      reviewer: "",
      sourceActionId: action.id,
      sourceConversationId: "",
      supersedes: c.before.map((f) => f.id),
      humanEdited: false,
    },
    c.before,
  );
}

export function coordinateActions(
  data: WorkspaceData,
  scope: { agentId: string; clientId: string; propertyId: string | null },
  actions: ProposedAction[],
  observations: Observation[],
  makeId: () => string,
) {
  const intelligence = prepareIntelligenceActions(
    data,
    scope,
    observations,
    makeId,
  );
  const updates: ProposedAction[] = [];
  for (const action of intelligence)
    for (const impact of proposalImpacts(data, action, scope).filter(
      (i) => i.kind === "task",
    )) {
      if (
        updates.some(
          (a) =>
            a.change?.type === "task" && a.change.targetId === impact.targetId,
        )
      )
        continue;
      const task = data.tasks.find((t) => t.id === impact.targetId)!;
      const relevant = intelligence.filter(
        (a) =>
          a.change?.type === "fact" &&
          (topicPatterns[a.change.observation.topic].test(
            `${task.title} ${task.detail}`,
          ) ||
            a.change.observation.topic === "cleaning"),
      );
      const body = `Review the current plan before arranging work:\n${relevant.map((a) => `${a.body} (${a.certainty})`).join("\n")}\nConfirm outstanding arrangements with the client and provider. Calendar time requires a separate human check.`;
      const taskTopic = (
        Object.keys(topicPatterns) as Observation["topic"][]
      ).find((t) => topicPatterns[t].test(task.title));
      const title =
        taskTopic === "photography"
          ? "Confirm photography availability"
          : taskTopic
            ? `Review ${topicLabels[taskTopic].toLowerCase()} arrangements`
            : task.title;
      const dueDate = relevant.some(
        (a) =>
          a.change?.type === "fact" &&
          a.change.before.some((f) => f.effectiveDate === task.dueDate),
      )
        ? null
        : task.dueDate;
      updates.push({
        id: makeId(),
        kind: "task_update",
        title,
        body,
        dueDate,
        status: "pending",
        sourceQuote: action.sourceQuote,
        certainty: "uncertain",
        original: { title, body, dueDate },
        originalAvailable: true,
        change: {
          type: "task",
          targetId: task.id,
          before: {
            title: task.title,
            detail: task.detail,
            dueDate: task.dueDate,
            status: task.status,
            calendarSchedule: task.calendarSchedule ?? null,
          },
        },
      });
    }
  const retained = actions.filter((a) => {
    if (
      ["task", "question"].includes(a.kind) &&
      data.packages.some(
        (p) =>
          sameRelationship(p, scope) &&
          p.actions.some(
            (prior) =>
              prior.status !== "rejected" &&
              prior.kind === a.kind &&
              normalize(prior.body) === normalize(a.body),
          ),
      )
    )
      return false;
    if (a.kind === "task") {
      const topic = (Object.keys(topicPatterns) as Observation["topic"][]).find(
        (t) => topicPatterns[t].test(`${a.title} ${a.body}`),
      );
      if (
        topic &&
        data.tasks.some(
          (t) =>
            sameRelationship(t, scope) &&
            t.status === "open" &&
            topicPatterns[topic].test(`${t.title} ${t.detail}`),
        )
      )
        return false;
    }
    if (
      a.kind === "question" &&
      data.commitments.some(
        (c) =>
          sameRelationship(c, scope) &&
          c.status === "open" &&
          (normalize(c.sourceQuote) === normalize(a.sourceQuote) ||
            (/patio furniture/i.test(c.detail) &&
              /patio furniture/i.test(a.body))),
      )
    )
      return false;
    return true;
  });
  return [...intelligence, ...updates, ...retained];
}
