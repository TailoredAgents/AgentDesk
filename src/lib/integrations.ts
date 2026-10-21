/** Provider boundaries deliberately have no network implementations in the pilot. */
export type IntegrationProvider =
  "lofty" | "google" | "microsoft" | "communications";
export type IntegrationConnection = {
  provider: IntegrationProvider;
  connected: boolean;
  label: string;
  description: string;
};
export const integrations: IntegrationConnection[] = [
  {
    provider: "lofty",
    connected: false,
    label: "Lofty",
    description: "CRM notes stay in AgentDesk. CRM sync is not connected.",
  },
  {
    provider: "google",
    connected: false,
    label: "Google Workspace",
    description: "Email and calendar access are not connected.",
  },
  {
    provider: "microsoft",
    connected: false,
    label: "Microsoft 365",
    description: "Email and calendar access are not connected.",
  },
  {
    provider: "communications",
    connected: false,
    label: "Communications",
    description: "Messages are saved drafts. No messages are sent externally.",
  },
];

export interface IntegrationAdapter {
  provider: IntegrationProvider;
  getConnection(workspaceId: string): Promise<IntegrationConnection>;
  // Future implementations require OAuth, tenant-scoped credentials, audited approvals,
  // delivery receipts, idempotency, and revocation before exposing outbound methods.
}

export function getCapabilities() {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    ai: configured,
    transcription: configured,
    externalSend: false as const,
    crmSync: false as const,
  };
}
