import "dotenv/config";
import { closeDatabase, getDatabase } from "../src/lib/db";

process.env.AGENTDESK_SKIP_AUTO_SEED = "1";
async function main() {
  const { storage } = await getDatabase();
  console.log(`AgentDesk migrations are current (${storage}).`);
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration failed.");
    process.exitCode = 1;
  })
  .finally(closeDatabase);
