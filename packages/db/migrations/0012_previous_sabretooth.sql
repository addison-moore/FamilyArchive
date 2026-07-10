CREATE TABLE "archive_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"requested_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"include_deleted" boolean DEFAULT false NOT NULL,
	"storage_driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "archive_exports" ADD CONSTRAINT "archive_exports_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_exports" ADD CONSTRAINT "archive_exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_exports_tree_idx" ON "archive_exports" USING btree ("tree_id");