CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"full_name" text NOT NULL,
	"gender" text DEFAULT 'unknown' NOT NULL,
	"gender_custom" text,
	"birth_year" integer,
	"birth_month" integer,
	"birth_day" integer,
	"birth_approx" boolean DEFAULT false NOT NULL,
	"birth_place_id" text,
	"death_year" integer,
	"death_month" integer,
	"death_day" integer,
	"death_approx" boolean DEFAULT false NOT NULL,
	"death_place_id" text,
	"biography" text,
	"notes" text,
	"profile_media_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_names" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text,
	"notes" text,
	"raw_imported" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"from_person_id" text NOT NULL,
	"to_person_id" text NOT NULL,
	"type" text NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_edge_unique" UNIQUE("tree_id","from_person_id","to_person_id","type")
);
--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_birth_place_id_places_id_fk" FOREIGN KEY ("birth_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_death_place_id_places_id_fk" FOREIGN KEY ("death_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_names" ADD CONSTRAINT "person_names_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "people_tree_idx" ON "people" USING btree ("tree_id","deleted_at");--> statement-breakpoint
CREATE INDEX "person_names_person_idx" ON "person_names" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "places_tree_idx" ON "places" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "relationships_tree_idx" ON "relationships" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "relationships_from_idx" ON "relationships" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "relationships_to_idx" ON "relationships" USING btree ("to_person_id");