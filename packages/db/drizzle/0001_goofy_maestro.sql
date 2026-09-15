CREATE INDEX "annotation_confluences_confluence_idx" ON "annotation_confluences" USING btree ("confluence_id");--> statement-breakpoint
CREATE INDEX "annotation_emo_states_state_idx" ON "annotation_emotional_states" USING btree ("emotional_state_id");--> statement-breakpoint
CREATE INDEX "import_batches_user_idx" ON "import_batches" USING btree ("user_id");