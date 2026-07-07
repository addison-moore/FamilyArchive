CREATE TABLE "media_faces" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"confidence" real,
	"detected_by" text NOT NULL,
	"detection_version" text,
	"person_id" text,
	"created_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_faces" ADD CONSTRAINT "media_faces_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_faces" ADD CONSTRAINT "media_faces_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_faces" ADD CONSTRAINT "media_faces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_faces_media_idx" ON "media_faces" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_faces_person_idx" ON "media_faces" USING btree ("person_id");