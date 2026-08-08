ALTER TYPE "public"."analysis_source" ADD VALUE 'overwolf';--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
