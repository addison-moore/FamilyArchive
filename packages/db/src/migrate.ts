import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { getEnv } from "@familyarchive/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { describeTarget } from "./migrate-target";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Migrations are applied to whatever DATABASE_URL happens to be set, and the
 * value usually comes from a local `.env` nobody re-reads. Printing the target
 * makes a misconfigured environment obvious instead of silent, and an
 * unexpected host has to be confirmed when a human is watching.
 *
 * Non-interactive callers (the compose `migrate` service, CI) are never
 * prompted — they get the printed target and proceed, because their
 * DATABASE_URL is set deliberately by the thing invoking them.
 */
async function confirmTarget(label: string, expected: boolean): Promise<boolean> {
  if (expected || process.env.MIGRATE_YES === "1" || !stdin.isTTY) return true;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\n  This is not a local database.\n` +
        `  Target: ${label}\n\n` +
        `  Apply migrations there? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } catch {
    // Ctrl+D closes stdin and rejects the question. An answer we could not read
    // is a "no" — the alternative is crashing with AbortError on a keystroke
    // that plainly means "stop".
    return false;
  } finally {
    rl.close();
  }
}

async function main() {
  const databaseUrl = getEnv().DATABASE_URL;
  const { label, expected } = describeTarget(databaseUrl);
  console.log(`Migrating ${label}`);

  if (!(await confirmTarget(label, expected))) {
    console.log("Aborted — no migrations applied.");
    return;
  }

  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`Migrations applied to ${label}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
