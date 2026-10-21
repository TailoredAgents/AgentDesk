import "dotenv/config";
import { closeDatabase, getDatabase } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";

process.env.AGENTDESK_SKIP_AUTO_SEED = "1";
async function main() {
  const { db } = await getDatabase();
  const inserted = await seedDatabase(db);
  console.log(
    inserted
      ? "Created The Willow Collective fictional sample workspace."
      : "Sample workspace already exists; saved edits were preserved.",
  );
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Seeding failed.");
    process.exitCode = 1;
  })
  .finally(closeDatabase);
