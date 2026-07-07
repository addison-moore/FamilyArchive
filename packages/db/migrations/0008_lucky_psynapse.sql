CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"kind" text DEFAULT 'gedcom' NOT NULL,
	"file_name" text NOT NULL,
	"imported_by" text,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "user_tree_preferences" ADD COLUMN "view_scope" text DEFAULT 'branch' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;