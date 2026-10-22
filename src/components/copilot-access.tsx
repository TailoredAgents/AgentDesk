"use client";
import { createContext } from "react";
export const CopilotAccess = createContext<{
  enabled: boolean;
  open: boolean;
  show: () => void;
}>({ enabled: false, open: false, show: () => {} });
