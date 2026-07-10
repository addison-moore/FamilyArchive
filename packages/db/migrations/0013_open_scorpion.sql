CREATE TABLE "instance_usage" (
	"id" text PRIMARY KEY DEFAULT 'instance' NOT NULL,
	"original_bytes" bigint DEFAULT 0 NOT NULL,
	"derivative_bytes" bigint DEFAULT 0 NOT NULL,
	"media_count" integer DEFAULT 0 NOT NULL,
	"notified_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
