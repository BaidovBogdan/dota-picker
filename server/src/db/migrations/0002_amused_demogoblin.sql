CREATE TABLE "analysis_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"selected_hero_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_reviews_rating_check" CHECK ("analysis_reviews"."rating" between 1 and 5),
	CONSTRAINT "analysis_reviews_selected_heroes_check" CHECK (
      jsonb_typeof("analysis_reviews"."selected_hero_ids") = 'array'
      and jsonb_array_length("analysis_reviews"."selected_hero_ids") <= 3
    ),
	CONSTRAINT "analysis_reviews_comment_check" CHECK (
      "analysis_reviews"."comment" is null or char_length("analysis_reviews"."comment") <= 1000
    )
);
--> statement-breakpoint
ALTER TABLE "analysis_reviews" ADD CONSTRAINT "analysis_reviews_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_reviews" ADD CONSTRAINT "analysis_reviews_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_reviews_account_analysis_unique" ON "analysis_reviews" USING btree ("account_id","analysis_id");--> statement-breakpoint
CREATE INDEX "analysis_reviews_created_idx" ON "analysis_reviews" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "analysis_reviews_rating_created_idx" ON "analysis_reviews" USING btree ("rating","created_at","id");