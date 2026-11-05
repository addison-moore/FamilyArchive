ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_suggested_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "suggestions" ALTER COLUMN "suggested_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;