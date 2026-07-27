CREATE TYPE "public"."otp_purpose" AS ENUM('register', 'login', 'upgrade_guest', 'password_reset', 'password_change');--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"email_hash" text NOT NULL,
	"account_id" uuid,
	"token_version" integer,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_attempts_check" CHECK (
      "otp_challenges"."attempts" >= 0 and "otp_challenges"."max_attempts" > 0 and "otp_challenges"."attempts" <= "otp_challenges"."max_attempts"
    )
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_challenges_email_purpose_created_idx" ON "otp_challenges" USING btree ("email_hash","purpose","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_account_purpose_created_idx" ON "otp_challenges" USING btree ("account_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_expires_idx" ON "otp_challenges" USING btree ("expires_at");