import { fileURLToPath } from "node:url";

import { getEnv } from "@familyarchive/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

async function main() {
  const client = postgres(getEnv().DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
