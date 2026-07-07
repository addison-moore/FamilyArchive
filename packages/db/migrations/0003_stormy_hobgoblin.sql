CREATE TABLE "user_tree_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tree_id" text NOT NULL,
	"starting_person_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_tree_preferences_user_tree_unique" UNIQUE("user_id","tree_id")
);
--> statement-breakpoint
ALTER TABLE "user_tree_preferences" ADD CONSTRAINT "user_tree_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tree_preferences" ADD CONSTRAINT "user_tree_preferences_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tree_preferences" ADD CONSTRAINT "user_tree_preferences_starting_person_id_people_id_fk" FOREIGN KEY ("starting_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;