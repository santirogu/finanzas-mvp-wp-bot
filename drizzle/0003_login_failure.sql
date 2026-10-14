CREATE TABLE "login_failure" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"first_failure_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
