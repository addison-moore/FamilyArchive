import { getEnv } from "@familyarchive/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let singleton: Db | undefined;

/**
 * Shared lazy client. postgres.js connects on first query, so importing this
 * module (e.g. during `next build`) never opens a connection by itself.
 */
export function getDb(): Db {
  if (!singleton) {
    singleton = createDb(getEnv().DATABASE_URL);
  }
  return singleton;
}
