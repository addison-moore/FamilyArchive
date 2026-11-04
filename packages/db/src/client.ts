import { getEnv } from "@familyarchive/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

// `next dev` evaluates this module separately per compiled route, so a module
// variable would give each route its own pool until Postgres runs out of
// connections. globalThis is shared by all of them: one pool per process.
const globalStore = globalThis as typeof globalThis & { familyArchiveDb?: Db };

/**
 * Shared lazy client. postgres.js connects on first query, so importing this
 * module (e.g. during `next build`) never opens a connection by itself.
 */
export function getDb(): Db {
  globalStore.familyArchiveDb ??= createDb(getEnv().DATABASE_URL);
  return globalStore.familyArchiveDb;
}
