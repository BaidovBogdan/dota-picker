CREATE INDEX "diagnostic_events_account_received_idx" ON "diagnostic_events" USING btree ("account_id","received_at");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_account_created_idx" ON "diagnostic_sessions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_account_last_event_idx" ON "diagnostic_sessions" USING btree ("account_id","last_event_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_mode_last_event_idx" ON "diagnostic_sessions" USING btree ("mode","last_event_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_status_last_event_idx" ON "diagnostic_sessions" USING btree ("status","last_event_at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_started_idx" ON "diagnostic_sessions" USING btree ("started_at","id");