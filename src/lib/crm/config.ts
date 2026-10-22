import { allCapabilities, type Capability } from "./types";

export function pilotConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const issues: string[] = [];
  if (env.CRM_PILOT_ENABLED !== "1")
    issues.push("The private CRM pilot is not enabled.");
  if (!env.PILOT_AUTH_SECRET || env.PILOT_AUTH_SECRET.length < 32)
    issues.push("Individual sign-in needs a dedicated session secret.");
  if (!env.PILOT_GOOGLE_CLIENT_ID || !env.PILOT_GOOGLE_CLIENT_SECRET)
    issues.push("Individual Google sign-in is awaiting configuration.");
  try {
    const url = new URL(env.APP_URL || "");
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          env.NODE_ENV !== "production" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new Error();
  } catch {
    issues.push("A canonical HTTPS APP_URL is required for the pilot.");
  }
  return { ready: issues.length === 0, issues };
}

export function loftyConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const issues = [...pilotConfiguration(env).issues];
  if (!env.LOFTY_CLIENT_ID || !env.LOFTY_CLIENT_SECRET)
    issues.push("Lofty developer credentials are not configured.");
  if (env.LOFTY_APP_APPROVED !== "1")
    issues.push(
      "Lofty application approval / authorized development access is pending.",
    );
  if (env.LOFTY_STATE_VERIFIED !== "1")
    issues.push(
      "Lofty must confirm secure OAuth state round-trip support before connection.",
    );
  if (!/^[a-f\d]{64}$/i.test(env.CRM_TOKEN_ENCRYPTION_KEY || ""))
    issues.push("Server token encryption needs a dedicated 32-byte key.");
  const configured = (env.LOFTY_CAPABILITIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (configured.some((v) => !allCapabilities.includes(v as Capability)))
    issues.push(
      "The Lofty endpoint grant list contains an unsupported capability.",
    );
  const capabilities = configured.filter((v) =>
    allCapabilities.includes(v as Capability),
  ) as Capability[];
  if (!capabilities.includes("leads.read"))
    issues.push(
      "Verify the account identity and assigned-lead read grants before connecting.",
    );
  for (const [write, read] of [
    ["notes.create", "notes.read"],
    ["tasks.create", "tasks.read"],
    ["tasks.update", "tasks.read"],
  ]) {
    if (configured.includes(write) && !configured.includes(read))
      issues.push(`${write} requires ${read} for confirmation.`);
  }
  return {
    ready: issues.length === 0,
    issues,
    capabilities,
    callbackUrl: `${env.APP_URL?.replace(/\/$/, "") || ""}/api/pilot/lofty/callback`,
  };
}
