CREATE TABLE "diagnostic_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"stage" text NOT NULL,
	"duration_ms" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "diagnostic_events_sequence_check" CHECK ("diagnostic_events"."sequence" between 1 and 100000),
	CONSTRAINT "diagnostic_events_status_check" CHECK ("diagnostic_events"."status" in ('info', 'success', 'warning', 'error')),
	CONSTRAINT "diagnostic_events_stage_check" CHECK ("diagnostic_events"."stage" in ('app', 'draft', 'capture', 'request', 'recognition', 'overlay', 'engine')),
	CONSTRAINT "diagnostic_events_duration_check" CHECK ("diagnostic_events"."duration_ms" is null or "diagnostic_events"."duration_ms" between 0 and 120000),
	CONSTRAINT "diagnostic_events_details_check" CHECK (jsonb_typeof("diagnostic_events"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "diagnostic_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"app_version" text NOT NULL,
	"app_build" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnostic_sessions_platform_check" CHECK ("diagnostic_sessions"."platform" in ('win32', 'darwin', 'linux')),
	CONSTRAINT "diagnostic_sessions_mode_check" CHECK ("diagnostic_sessions"."mode" in ('vision', 'overwolf')),
	CONSTRAINT "diagnostic_sessions_status_check" CHECK ("diagnostic_sessions"."status" in ('active', 'completed', 'error')),
	CONSTRAINT "diagnostic_sessions_version_check" CHECK (
      char_length("diagnostic_sessions"."app_version") between 1 and 32
      and char_length("diagnostic_sessions"."app_build") between 1 and 64
    ),
	CONSTRAINT "diagnostic_sessions_counts_check" CHECK (
      "diagnostic_sessions"."event_count" >= 0 and "diagnostic_sessions"."error_count" >= 0 and "diagnostic_sessions"."error_count" <= "diagnostic_sessions"."event_count"
    )
);
--> statement-breakpoint
ALTER TABLE "diagnostic_events" ADD CONSTRAINT "diagnostic_events_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_events" ADD CONSTRAINT "diagnostic_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostic_events_session_sequence_unique" ON "diagnostic_events" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "diagnostic_events_account_created_idx" ON "diagnostic_events" USING btree ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_events_session_created_idx" ON "diagnostic_events" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_events_expires_idx" ON "diagnostic_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_account_started_idx" ON "diagnostic_sessions" USING btree ("account_id","started_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_last_event_idx" ON "diagnostic_sessions" USING btree ("last_event_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_expires_idx" ON "diagnostic_sessions" USING btree ("expires_at");