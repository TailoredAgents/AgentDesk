import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "./auth";
export type AIBudget = {
  signal: AbortSignal;
  onUsage: (input: number, output: number) => void;
  beforeCall: () => void;
};
export const aiBudget = new AsyncLocalStorage<AIBudget>();
export function assertAIBudget() {
  if (aiBudget.getStore()?.signal.aborted)
    throw new ApiError(
      504,
      "This request reached its time limit. Any saved drafts remain available; retry to recover them.",
      "copilot_timeout",
    );
}
