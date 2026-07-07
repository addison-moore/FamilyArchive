import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { people } from "./people";
import { trees } from "./trees";

/**
 * Per-user, per-tree preferences — currently the preferred starting/root person
 * for the tree view (PRD §7.5). A table rather than a column on
 * tree_memberships because the Owner can access trees without a membership.
 */
export const userTreePreferences = pgTable(
  "user_tree_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    startingPersonId: text("starting_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique("user_tree_preferences_user_tree_unique").on(table.userId, table.treeId)],
);
