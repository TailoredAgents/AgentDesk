export type DeploymentEnvironment = Readonly<
  Record<string, string | undefined>
>;

export const MIN_WORKSPACE_PASSWORD_LENGTH = 12;
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Fixed messages only: never include environment values or URL parser errors. */
export function validateWorkspaceAccessEnvironment(
  environment: DeploymentEnvironment,
): string[] {
  const errors: string[] = [];
  const password = environment.DEMO_PASSWORD;
  const secret = environment.SESSION_SECRET;

  if (!password) {
    errors.push("DEMO_PASSWORD is required for production workspace access.");
  } else if (password.length < MIN_WORKSPACE_PASSWORD_LENGTH) {
    errors.push("DEMO_PASSWORD must contain at least 12 characters.");
  }

  if (!secret) {
    errors.push("SESSION_SECRET is required for production workspace access.");
  } else if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push("SESSION_SECRET must contain at least 32 characters.");
  }

  return errors;
}

/** Validate production configuration even when a pre-deploy shell has no NODE_ENV. */
export function validateDeploymentEnvironment(
  environment: DeploymentEnvironment,
): string[] {
  const errors = validateWorkspaceAccessEnvironment(environment);
  const databaseUrl = environment.DATABASE_URL;

  if (!databaseUrl) {
    errors.push("DATABASE_URL is required. Set the PostgreSQL connection URL.");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.hash
      ) {
        throw new Error("Invalid database URL");
      }
    } catch {
      errors.push(
        "DATABASE_URL must be a valid postgres:// or postgresql:// connection URL with a hostname and no fragment.",
      );
    }
  }

  // Optional because platform routing can supply the request origin. When supplied,
  // this is the canonical public origin used by production CSRF checks.
  const appUrl = environment.APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error("Invalid application origin");
      }
    } catch {
      errors.push(
        "APP_URL must be a valid HTTPS origin without credentials, a path, query parameters, or a fragment.",
      );
    }
  }

  // OPENAI_API_KEY is intentionally optional: saved sample work remains usable.
  return errors;
}
