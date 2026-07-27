ALTER TABLE "analysis_reviews" DROP CONSTRAINT "analysis_reviews_comment_check";--> statement-breakpoint
DROP INDEX "analysis_reviews_created_idx";--> statement-breakpoint
DROP INDEX "analysis_reviews_rating_created_idx";--> statement-breakpoint
CREATE INDEX "analysis_reviews_account_updated_idx" ON "analysis_reviews" USING btree ("account_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "analysis_reviews_updated_idx" ON "analysis_reviews" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "analysis_reviews_rating_updated_idx" ON "analysis_reviews" USING btree ("rating","updated_at","id");--> statement-breakpoint
ALTER TABLE "analysis_reviews" ADD CONSTRAINT "analysis_reviews_comment_check" CHECK (
      "analysis_reviews"."comment" is null or char_length("analysis_reviews"."comment") <= 500
    );