CREATE TYPE "public"."account_kind" AS ENUM('guest', 'user');--> statement-breakpoint
CREATE TYPE "public"."analysis_source" AS ENUM('manual', 'photo');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."billing_event_status" AS ENUM('pending', 'processed');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."quota_reason" AS ENUM('analysis', 'refund');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "account_kind" DEFAULT 'guest' NOT NULL,
	"device_id" text,
	"email" text,
	"password_hash" text,
	"token_version" integer DEFAULT 0 NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"plan_product_id" text,
	"plan_expires_at" timestamp with time zone,
	"billing_updated_at" timestamp with time zone,
	"quota_balance" integer NOT NULL,
	"quota_refreshed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_identity_check" CHECK (
      ("accounts"."kind" = 'guest' and "accounts"."device_id" is not null and "accounts"."email" is null and "accounts"."password_hash" is null)
      or
      ("accounts"."kind" = 'user' and "accounts"."email" is not null and "accounts"."password_hash" is not null)
    )
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'processing' NOT NULL,
	"source" "analysis_source" NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"patch" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "billing_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_tombstones" (
	"account_id" text PRIMARY KEY NOT NULL,
	"has_entitlement" boolean DEFAULT false NOT NULL,
	"plan_product_id" text,
	"plan_expires_at" timestamp with time zone,
	"quota_balance" integer,
	"quota_refreshed_at" timestamp with time zone,
	"billing_updated_at" timestamp with time zone,
	"retain_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"response" jsonb,
	"resource_id" uuid,
	"lease_token" text NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"analysis_id" uuid,
	"delta" integer NOT NULL,
	"reason" "quota_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_events" ADD CONSTRAINT "quota_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_events" ADD CONSTRAINT "quota_events_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_device_id_unique" ON "accounts" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_unique" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "analyses_account_created_idx" ON "analyses" USING btree ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "analyses_account_status_created_idx" ON "analyses" USING btree ("account_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "billing_events_account_created_idx" ON "billing_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_tombstones_retain_until_idx" ON "billing_tombstones" USING btree ("retain_until");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_account_endpoint_key_unique" ON "idempotency_records" USING btree ("account_id","endpoint","key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "quota_events_account_created_idx" ON "quota_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_events_analysis_reason_unique" ON "quota_events" USING btree ("analysis_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_account_idx" ON "refresh_tokens" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");