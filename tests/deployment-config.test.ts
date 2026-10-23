import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateDeploymentEnvironment,
  validateWorkspaceAccessEnvironment,
  type DeploymentEnvironment,
} from "../src/lib/deployment-config";

const valid: DeploymentEnvironment = {
  DATABASE_URL:
    "postgresql://test-user:test-password@db.example.invalid/agentdesk",
  DEMO_PASSWORD: "test-workspace-password",
  SESSION_SECRET: "test-session-secret-at-least-thirty-two-characters",
  APP_URL: "https://agentdesk.example",
};

test("production preflight accepts PostgreSQL and optional OpenAI credentials", () => {
  assert.deepEqual(validateDeploymentEnvironment(valid), []);
  assert.deepEqual(
    validateDeploymentEnvironment({
      ...valid,
      DATABASE_URL:
        "postgres://db.example.invalid:5432/agentdesk?sslmode=require",
      OPENAI_API_KEY: "",
      APP_URL: undefined,
    }),
    [],
  );
});

test("missing deployment settings fail regardless of NODE_ENV", () => {
  for (const NODE_ENV of [undefined, "development", "test", "production"]) {
    const errors = validateDeploymentEnvironment({ NODE_ENV });
    assert.equal(errors.length, 3);
    assert.ok(errors.some((message) => message.startsWith("DATABASE_URL")));
    assert.ok(errors.some((message) => message.startsWith("DEMO_PASSWORD")));
    assert.ok(errors.some((message) => message.startsWith("SESSION_SECRET")));
  }
});

test("access validation and deployment checks share the exact password and secret minimums", () => {
  const tooShort = {
    ...valid,
    DEMO_PASSWORD: "x".repeat(3),
    SESSION_SECRET: "y".repeat(31),
  };
  assert.deepEqual(validateDeploymentEnvironment(tooShort), [
    "DEMO_PASSWORD must contain at least 4 characters.",
    "SESSION_SECRET must contain at least 32 characters.",
  ]);
  assert.deepEqual(
    validateWorkspaceAccessEnvironment(tooShort),
    validateDeploymentEnvironment(tooShort),
  );
  assert.deepEqual(
    validateDeploymentEnvironment({
      ...valid,
      DEMO_PASSWORD: "0427",
      SESSION_SECRET: "y".repeat(32),
    }),
    [],
  );
});

test("database URL validation rejects malformed and non-PostgreSQL URLs", () => {
  for (const DATABASE_URL of [
    "not-a-url",
    "https://database.example/db",
    "postgresql:///db",
    "postgresql://db.example/db#secret",
    "postgresql://db.example:99999/db",
  ]) {
    const errors = validateDeploymentEnvironment({ ...valid, DATABASE_URL });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^DATABASE_URL/);
  }
});

test("configured application origin must be HTTPS and cannot contain URL credentials or a path", () => {
  for (const APP_URL of [
    "http://agentdesk.example",
    "not-a-url",
    "https://user:password@agentdesk.example",
    "https://agentdesk.example/private",
    "https://agentdesk.example?token=value",
    "https://agentdesk.example#fragment",
  ]) {
    const errors = validateDeploymentEnvironment({ ...valid, APP_URL });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^APP_URL/);
  }
  assert.deepEqual(
    validateDeploymentEnvironment({
      ...valid,
      APP_URL: "https://agentdesk.example/",
    }),
    [],
  );
});

function runPreflight(environment: DeploymentEnvironment) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", path.resolve("scripts/check-config.ts")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: "",
        DEMO_PASSWORD: "",
        SESSION_SECRET: "",
        APP_URL: "",
        OPENAI_API_KEY: "",
        ...environment,
      },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

test("CLI rejects invalid production configuration without printing supplied values", () => {
  const privateValues = {
    DATABASE_URL:
      "mysql://private-user:private-database-password@private-db.example/app",
    DEMO_PASSWORD: "x9Q",
    SESSION_SECRET: "PRIVATE-SECRET",
    APP_URL: "http://private-user:private-app-password@private-app.example",
    OPENAI_API_KEY: "private-optional-openai-key",
  };
  const result = runPreflight(privateValues);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  const output = `${result.stdout}\n${result.stderr}`;
  for (const value of Object.values(privateValues))
    assert.equal(output.includes(value), false);
  for (const fragment of [
    "private-user",
    "private-database-password",
    "private-app-password",
    "private-db.example",
  ])
    assert.equal(output.includes(fragment), false);
  assert.match(output, /DEMO_PASSWORD must contain at least 4 characters/);
  assert.match(output, /SESSION_SECRET must contain at least 32 characters/);
  assert.match(output, /DATABASE_URL must be a valid/);
  assert.match(output, /APP_URL must be a valid HTTPS origin/);
});

test("CLI succeeds without an API key or a database connection when syntax is valid", () => {
  const result = runPreflight(valid);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /AgentDesk production configuration is valid/);
  for (const value of Object.values(valid))
    assert.equal(result.stdout.includes(value!), false);
});
