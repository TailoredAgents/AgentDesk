import AgentDesk from "@/components/agentdesk";
import { enabled } from "@/lib/copilot/types";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AgentDesk copilotEnabled={enabled()} />;
}
