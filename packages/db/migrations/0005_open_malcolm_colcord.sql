CREATE TABLE "media_derivatives" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"kind" text NOT NULL,
	"page" integer DEFAULT 0 NOT NULL,
	"storage_driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_derivatives_media_kind_page_unique" UNIQUE("media_id","kind","page")
);
--> statement-breakpoint
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;