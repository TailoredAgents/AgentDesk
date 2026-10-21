import "dotenv/config";
import { migrateConfiguredDatabase } from "../src/lib/db";

async function main() {
  const { storage } = await migrateConfiguredDatabase();
  console.log(`AgentDesk migrations are current (${storage}).`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
