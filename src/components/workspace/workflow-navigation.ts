import type { WorkspaceData, WorkPackage } from "@/lib/types";
import { situationImpacts, currentContextText } from "@/lib/intelligence";
import type { SituationImpact } from "@/lib/intelligence-types";

export type WorkspaceTarget =
  | { kind: "task" | "appointment" | "commitment" | "review"; id: string }
  | { kind: "document"; id: string; versionId?: string };

export function impactTarget(
  data: WorkspaceData,
  impact: SituationImpact,
): WorkspaceTarget | undefined {
  if (impact.kind === "message") {
    const pkg = data.packages.find((p) =>
      p.actions.some((a) => a.id === impact.targetId),
    );
    return pkg ? { kind: "review", id: pkg.id } : undefined;
  }
  return {
    kind: impact.kind,
    id: impact.targetId,
    ...(impact.versionId ? { versionId: impact.versionId } : {}),
  };
}

export function searchableWork(data: WorkspaceData, query: string) {
  const q = query.toLowerCase().trim();
  const context = (item: {
    clientId: string | null;
    propertyId: string | null;
  }) =>
    `${data.clients.find((c) => c.id === item.clientId)?.name ?? ""} ${data.properties.find((p) => p.id === item.propertyId)?.address ?? ""}`;
  const documents = data.workProducts.flatMap((product) => {
    const version = [...product.versions].sort(
      (a, b) => b.version - a.version,
    )[0];
    return version &&
      `${version.content.title} ${context(product)}`.toLowerCase().includes(q)
      ? [{ product, version }]
      : [];
  });
  const tasks = data.tasks.filter((t) =>
    `${t.title} ${t.detail} ${context(t)}`.toLowerCase().includes(q),
  );
  return { documents, tasks };
}

export function reviewGroups(actions: WorkPackage["actions"]) {
  return [
    {
      title: "Communications",
      actions: actions.filter((a) => a.kind === "message"),
    },
    {
      title: "Client & listing records",
      actions: actions.filter((a) =>
        ["summary", "crm_note", "listing_update", "intelligence"].includes(
          a.kind,
        ),
      ),
    },
    {
      title: "Next steps",
      actions: actions.filter(
        (a) =>
          ![
            "message",
            "summary",
            "crm_note",
            "listing_update",
            "intelligence",
          ].includes(a.kind),
      ),
    },
  ].filter((group) => group.actions.length);
}

export function outdatedReviewActions(data: WorkspaceData, pkg?: WorkPackage) {
  if (!pkg) return [];
  const memory = (data.clientFacts ?? []).filter(
    (f) =>
      f.agentId === pkg.agentId &&
      f.clientId === pkg.clientId &&
      (!f.propertyId || f.propertyId === pkg.propertyId),
  );
  return pkg.actions
    .filter((a) => currentContextText(a.body, memory) !== a.body)
    .map((a) => a.id);
}

// The selected record determines its tab, including after a partial/full save.
export function reviewSelection(
  packages: WorkPackage[],
  agentId: string,
  selected: string | null,
  fallbackTab: "pending" | "reviewed",
) {
  const owned = packages.filter((p) => p.agentId === agentId);
  const target = owned.find((p) => p.id === selected);
  const tab = target?.status ?? fallbackTab;
  const list = owned.filter((p) => p.status === tab);
  return { tab, list, pkg: target ?? list[0] };
}

export function savedConversationReview(
  data: WorkspaceData,
  agentId: string,
  clientId: string,
  propertyId: string,
) {
  if (!data.workspace.sample) return undefined;
  return data.packages.find(
    (p) =>
      p.agentId === agentId &&
      p.clientId === clientId &&
      p.propertyId === (propertyId || null) &&
      p.origin === "sample" &&
      data.conversations.some(
        (c) => c.id === p.conversationId && c.source === "sample",
      ),
  );
}

export function appointmentContext(data: WorkspaceData, appointmentId: string) {
  const impacts = situationImpacts(data).filter(
    (i) => i.kind === "appointment" && i.targetId === appointmentId,
  );
  const ids = new Set(impacts.map((i) => i.factId));
  const facts = (data.clientFacts ?? []).filter(
    (f) => ids.has(f.id) && f.status !== "superseded",
  );
  return { impacts, facts };
}
