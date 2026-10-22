import type { WorkspaceData } from "../../src/lib/types";
import { sampleWorkspace, sampleAgents, sampleClients, sampleProperties, sampleTasks, sampleConversations, samplePackages, sampleAppointments, sampleCommitments } from "../../src/lib/db/seed-data";
import { buildWorkProductContext, buildSavedSellerContent } from "../../src/lib/work-product-content";

export function sellerPdfFixture() {
  const data: WorkspaceData = {
    workspace: sampleWorkspace, agents: sampleAgents, clients: sampleClients,
    properties: sampleProperties, tasks: sampleTasks, conversations: sampleConversations,
    packages: samplePackages, appointments: sampleAppointments, commitments: sampleCommitments,
    activities: [], recommendations: [], reviewHistory: [], workProducts: [],
    capabilities: { ai: false, transcription: false, externalSend: false, crmSync: false },
  };
  const pkg = data.packages.find((value) => value.id === "package-sarah")!;
  const context = buildWorkProductContext(data, { kind: "seller_preparation", agentId: pkg.agentId, clientId: pkg.clientId, propertyId: pkg.propertyId, sourcePackageId: pkg.id });
  return { productId: "seller-sample-pdf", kind: "seller_preparation" as const, version: 1, content: buildSavedSellerContent(context.snapshot), snapshot: context.snapshot, createdAt: "2026-10-23T13:00:00Z" };
}
