CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"concurrency" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_project_created_idx" ON "audit_log" USING btree ("project_id","created_at");