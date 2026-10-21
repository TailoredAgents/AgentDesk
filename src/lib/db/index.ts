import { mkdir, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
type DatabaseHandle = {
  db: Database;
  storage: "postgresql" | "pglite";
  close: () => Promise<void>;
};
const runtime = globalThis as typeof globalThis & {
  __agentdeskDatabase?: Promise<DatabaseHandle>;
};

/** Both drivers run the same PostgreSQL migrations; PGlite is only the local fallback. */
export async function migrateDatabase(
  db: Database,
  storage: DatabaseHandle["storage"],
) {
  const directory = path.join(process.cwd(), "migrations");
  const files = (await readdir(directory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  await db.transaction(async (tx) => {
    if (storage === "postgresql")
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741852963)`);
    await tx.execute(
      sql`CREATE TABLE IF NOT EXISTS agentdesk_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    for (const file of files) {
      const contents = await readFile(path.join(directory, file), "utf8");
      const checksum = createHash("sha256").update(contents).digest("hex");
      const result = (await tx.execute(
        sql`SELECT checksum FROM agentdesk_migrations WHERE name = ${file}`,
      )) as { rows: { checksum: string }[] };
      if (result.rows.length) {
        if (result.rows[0].checksum !== checksum)
          throw new Error(
            `Applied migration ${file} changed. Add a new migration instead.`,
          );
        continue;
      }
      // These checked-in migrations intentionally contain simple SQL statements only.
      for (const statement of contents
        .split(/;\s*(?:\r?\n|$)/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(
        sql`INSERT INTO agentdesk_migrations (name, checksum) VALUES (${file}, ${checksum})`,
      );
    }
  });
}

async function initialize(): Promise<DatabaseHandle> {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production" && !url)
    throw new Error(
      "DATABASE_URL is required in production. Local PGlite storage is for development only.",
    );
  let handle: DatabaseHandle;
  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", () =>
      console.error(
        "AgentDesk: an idle database connection closed unexpectedly.",
      ),
    );
    handle = {
      db: postgresDrizzle(pool, { schema }) as unknown as Database,
      storage: "postgresql",
      close: () => pool.end(),
    };
  } else {
    const configuredPath = process.env.PGLITE_DATA_DIR;
    // This is mutable development data, never an asset to include in a server bundle.
    const dataDir =
      configuredPath === ":memory:"
        ? undefined
        : path.resolve(
            /* turbopackIgnore: true */ configuredPath ||
              path.join(process.cwd(), ".agentdesk", "postgres"),
          );
    if (dataDir) await mkdir(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    await client.waitReady;
    handle = {
      db: pgliteDrizzle(client, { schema }) as unknown as Database,
      storage: "pglite",
      close: () => client.close(),
    };
  }
  try {
    await migrateDatabase(handle.db, handle.storage);
    if (!url && process.env.AGENTDESK_SKIP_AUTO_SEED !== "1")
      await seedDatabase(handle.db);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** A process-wide promise also prevents duplicate WASM engines during Next hot reload. */
export async function getDatabase() {
  if (!runtime.__agentdeskDatabase)
    runtime.__agentdeskDatabase = initialize().catch((error) => {
      runtime.__agentdeskDatabase = undefined;
      throw error;
    });
  return runtime.__agentdeskDatabase;
}

export async function closeDatabase() {
  const pending = runtime.__agentdeskDatabase;
  if (!pending) return;
  const handle = await pending;
  await handle.close();
  if (runtime.__agentdeskDatabase === pending)
    runtime.__agentdeskDatabase = undefined;
}
