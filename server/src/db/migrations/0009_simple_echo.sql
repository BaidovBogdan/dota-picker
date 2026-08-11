CREATE TYPE "public"."draft_pair_relation" AS ENUM('matchup', 'synergy');--> statement-breakpoint
CREATE TYPE "public"."draft_snapshot_status" AS ENUM('building', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "draft_meta_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patch" text NOT NULL,
	"population" text NOT NULL,
	"population_version" integer DEFAULT 1 NOT NULL,
	"snapshot_version" integer DEFAULT 1 NOT NULL,
	"status" "draft_snapshot_status" DEFAULT 'building' NOT NULL,
	"source" text DEFAULT 'opendota_public_matches_explorer_positions' NOT NULL,
	"heroes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"rank_match_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_meta_snapshots_match_count_check" CHECK ("draft_meta_snapshots"."match_count" >= 0),
	CONSTRAINT "draft_meta_snapshots_population_check" CHECK ("draft_meta_snapshots"."population" in ('ranked_all_pick', 'public_all_pick')),
	CONSTRAINT "draft_meta_snapshots_population_version_check" CHECK ("draft_meta_snapshots"."population_version" = 1),
	CONSTRAINT "draft_meta_snapshots_ready_fields_check" CHECK ("draft_meta_snapshots"."status" <> 'ready' or ("draft_meta_snapshots"."generated_at" is not null and "draft_meta_snapshots"."expires_at" is not null and "draft_meta_snapshots"."completed_at" is not null and "draft_meta_snapshots"."expires_at" >= "draft_meta_snapshots"."generated_at" and jsonb_array_length("draft_meta_snapshots"."heroes") > 0)),
	CONSTRAINT "draft_meta_snapshots_snapshot_version_check" CHECK ("draft_meta_snapshots"."snapshot_version" = 1),
	CONSTRAINT "draft_meta_snapshots_source_check" CHECK ("draft_meta_snapshots"."source" in ('opendota_public_matches_explorer_positions', 'opendota_public_matches_lane_roles'))
);
--> statement-breakpoint
CREATE TABLE "draft_pair_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"relation" "draft_pair_relation" NOT NULL,
	"selected_hero_id" integer NOT NULL,
	"candidate_hero_id" integer NOT NULL,
	"rank_bucket" integer DEFAULT 0 NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	CONSTRAINT "draft_pair_stats_hero_check" CHECK (
      "draft_pair_stats"."selected_hero_id" > 0
      and "draft_pair_stats"."candidate_hero_id" > 0
      and "draft_pair_stats"."selected_hero_id" <> "draft_pair_stats"."candidate_hero_id"
    ),
	CONSTRAINT "draft_pair_stats_rank_bucket_check" CHECK ("draft_pair_stats"."rank_bucket" between 0 and 8),
	CONSTRAINT "draft_pair_stats_games_check" CHECK ("draft_pair_stats"."games" > 0 and "draft_pair_stats"."wins" between 0 and "draft_pair_stats"."games")
);
--> statement-breakpoint
CREATE TABLE "draft_position_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"position" integer NOT NULL,
	"rank_bucket" integer DEFAULT 0 NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	CONSTRAINT "draft_position_stats_hero_check" CHECK ("draft_position_stats"."hero_id" > 0),
	CONSTRAINT "draft_position_stats_position_check" CHECK ("draft_position_stats"."position" between 1 and 5),
	CONSTRAINT "draft_position_stats_rank_bucket_check" CHECK ("draft_position_stats"."rank_bucket" between 0 and 8),
	CONSTRAINT "draft_position_stats_games_check" CHECK ("draft_position_stats"."games" > 0 and "draft_position_stats"."wins" between 0 and "draft_position_stats"."games")
);
--> statement-breakpoint
ALTER TABLE "draft_pair_stats" ADD CONSTRAINT "draft_pair_stats_snapshot_id_draft_meta_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."draft_meta_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_position_stats" ADD CONSTRAINT "draft_position_stats_snapshot_id_draft_meta_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."draft_meta_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_meta_snapshots_active_unique" ON "draft_meta_snapshots" USING btree ("patch","population") WHERE "draft_meta_snapshots"."status" = 'building';--> statement-breakpoint
CREATE INDEX "draft_meta_snapshots_ready_lookup_idx" ON "draft_meta_snapshots" USING btree ("patch","population","status","completed_at");--> statement-breakpoint
CREATE INDEX "draft_meta_snapshots_population_ready_lookup_idx" ON "draft_meta_snapshots" USING btree ("population","status","completed_at");--> statement-breakpoint
CREATE INDEX "draft_meta_snapshots_expires_idx" ON "draft_meta_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_pair_stats_snapshot_unique" ON "draft_pair_stats" USING btree ("snapshot_id","relation","selected_hero_id","candidate_hero_id","rank_bucket");--> statement-breakpoint
CREATE INDEX "draft_pair_stats_snapshot_lookup_idx" ON "draft_pair_stats" USING btree ("snapshot_id","relation","selected_hero_id","rank_bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_position_stats_snapshot_unique" ON "draft_position_stats" USING btree ("snapshot_id","hero_id","position","rank_bucket");--> statement-breakpoint
CREATE INDEX "draft_position_stats_snapshot_lookup_idx" ON "draft_position_stats" USING btree ("snapshot_id","rank_bucket","position");--> statement-breakpoint
CREATE INDEX "accounts_created_idx" ON "accounts" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "analyses_created_idx" ON "analyses" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "billing_events_created_idx" ON "billing_events" USING btree ("created_at","event_id");
