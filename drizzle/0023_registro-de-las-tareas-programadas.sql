CREATE TABLE "cron_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "cron_run_job_started_at_idx" ON "cron_run" USING btree ("job","started_at");