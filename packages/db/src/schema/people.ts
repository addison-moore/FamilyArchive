import type { Gender, PersonNameKind, RelationshipType } from "@familyarchive/shared";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { trees } from "./trees";

/**
 * People, alternate names, places, and relationships (PRD §12, §13, §20, §28).
 * People are soft-deleted (deleted_at); queries must filter it out and always
 * scope by tree_id (PRD §31.2).
 */

export const places = pgTable(
  "places",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name"),
    notes: text("notes"),
    /** Original imported value (e.g. raw GEDCOM PLAC line), preserved verbatim. */
    rawImported: text("raw_imported"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("places_tree_idx").on(table.treeId)],
);

export const people = pgTable(
  "people",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    /** Text, not a PG enum, so display options can evolve without migrations (PRD §12.3). */
    gender: text("gender").$type<Gender>().notNull().default("unknown"),
    genderCustom: text("gender_custom"),
    // Date parts (PRD §12.4): exact, partial, approximate, or unknown (all null).
    birthYear: integer("birth_year"),
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    birthApprox: boolean("birth_approx").notNull().default(false),
    birthPlaceId: text("birth_place_id").references(() => places.id, { onDelete: "set null" }),
    deathYear: integer("death_year"),
    deathMonth: integer("death_month"),
    deathDay: integer("death_day"),
    deathApprox: boolean("death_approx").notNull().default(false),
    deathPlaceId: text("death_place_id").references(() => places.id, { onDelete: "set null" }),
    biography: text("biography"),
    notes: text("notes"),
    /** References media_items once that table lands in M6; plain column until then (PRD §12.5). */
    profileMediaId: text("profile_media_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
    deletedBy: text("deleted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("people_tree_idx").on(table.treeId, table.deletedAt)],
);

export const personNames = pgTable(
  "person_names",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<PersonNameKind>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("person_names_person_idx").on(table.personId)],
);

export const relationships = pgTable(
  "relationships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    /** Parent types: from = parent, to = child. Partner types: symmetric. */
    fromPersonId: text("from_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    toPersonId: text("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: text("type").$type<RelationshipType>().notNull(),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("relationships_edge_unique").on(
      table.treeId,
      table.fromPersonId,
      table.toPersonId,
      table.type,
    ),
    index("relationships_tree_idx").on(table.treeId),
    index("relationships_from_idx").on(table.fromPersonId),
    index("relationships_to_idx").on(table.toPersonId),
  ],
);
