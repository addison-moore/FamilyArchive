CREATE TABLE "media_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"uploader_id" text,
	"title" text,
	"description" text,
	"media_type" text NOT NULL,
	"date_year" integer,
	"date_month" integer,
	"date_day" integer,
	"date_approx" boolean DEFAULT false NOT NULL,
	"place_id" text,
	"original_filename" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"mime_type" text NOT NULL,
	"hash" text,
	"storage_driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"ocr_text" text,
	"transcription_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_people" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_people_media_person_unique" UNIQUE("media_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "media_tags" (
	"media_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_tags_media_id_tag_id_pk" PRIMARY KEY("media_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tree_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_tree_name_unique" UNIQUE("tree_id","name")
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_people" ADD CONSTRAINT "media_people_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_people" ADD CONSTRAINT "media_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_people" ADD CONSTRAINT "media_people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_items_tree_idx" ON "media_items" USING btree ("tree_id","deleted_at");--> statement-breakpoint
CREATE INDEX "media_items_hash_idx" ON "media_items" USING btree ("tree_id","hash");--> statement-breakpoint
CREATE INDEX "media_people_person_idx" ON "media_people" USING btree ("person_id");