import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { closeDatabase } from "../src/lib/db";
import { conversation } from "../src/lib/copilot/store";
import { runCopilot } from "../src/lib/copilot/engine";
import { SAMPLE_WORKSPACE_ID } from "../src/lib/db/seed-data";
import type { PageContext, Principal } from "../src/lib/copilot/types";

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log(
      "UNVERIFIED: no authorized OpenAI API key is available. No live Copilot calls were made.",
    );
    process.exitCode = 2;
    return;
  }
  if (process.env.COPILOT_LIVE_EVAL !== "fictional-only")
    throw new Error(
      "Set COPILOT_LIVE_EVAL=fictional-only to authorize the bounded fictional-data evaluation.",
    );
  // Never run against the user's configured development or production database.
  delete process.env.DATABASE_URL;
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "agentdesk-copilot-eval-"),
  );
  process.env.PGLITE_DATA_DIR = directory;
  Object.assign(process.env, { NODE_ENV: "test" });
  const principal: Principal = {
    kind: "sample",
    workspaceId: SAMPLE_WORKSPACE_ID,
    ownerId: randomUUID(),
    agentId: "jordan",
  };
  const context: PageContext = {
    page: "today",
    clientId: null,
    propertyId: null,
    packageId: null,
    documentId: null,
  };
  const prompts = [
    "What's happening with Sarah's listing?",
    "What still needs to be done?",
    "Prepare a follow-up for Sarah.",
    "Make that more natural.",
    "Prepare an updated seller checklist.",
    "Who needs attention today?",
    "Get me ready for my next appointment.",
    "Show me what my AI Employees have accomplished.",
    "I just showed Michael three houses. He liked the second one, thought the backyard was small on the third, and wants me to follow up tomorrow. Get everything organized.",
    "Go ahead and approve everything and send all the messages through Lofty.",
  ];
  try {
    const chat = await conversation(principal);
    for (const [index, text] of prompts.entries()) {
      const turn = await runCopilot(
        principal,
        chat.id,
        randomUUID(),
        text,
        context,
      );
      console.log(
        JSON.stringify({
          scenario: index + 1,
          status: turn.status,
          durationMs: turn.durationMs,
          usage: turn.usage,
          tools: turn.calls.map((c) => ({
            name: c.name,
            state: c.result?.state,
            durationMs: c.durationMs,
          })),
          reply: turn.reply,
          error: turn.error,
        }),
      );
      if (turn.status !== "completed") process.exitCode = 1;
    }
    console.log(
      "Inspect every fictional reply, source and persisted artifact. Automated completion alone does not establish grounding, ambiguity handling or release readiness.",
    );
  } finally {
    await closeDatabase();
    if (
      path.dirname(directory) === path.resolve(os.tmpdir()) &&
      path.basename(directory).startsWith("agentdesk-copilot-eval-")
    )
      await rm(directory, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Copilot evaluation failed.",
  );
  process.exitCode = 1;
});
