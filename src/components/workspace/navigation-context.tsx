"use client";
import { createContext, useContext } from "react";
import type { WorkspaceTarget } from "./workflow-navigation";

export const WorkspaceNavigation = createContext<{
  openTarget: (target: WorkspaceTarget) => void;
  openFollowUps: (agentId: string) => void;
} | null>(null);
export const useWorkspaceNavigation = () => useContext(WorkspaceNavigation);
