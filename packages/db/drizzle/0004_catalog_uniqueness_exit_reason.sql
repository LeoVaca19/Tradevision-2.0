CREATE TYPE "public"."exit_reason" AS ENUM('take_profit', 'break_even', 'stop_loss');--> statement-breakpoint
ALTER TABLE "confluences" DROP CONSTRAINT "confluences_scope_label_uq";--> statement-breakpoint
ALTER TABLE "emotional_states" DROP CONSTRAINT "emotional_states_scope_label_uq";--> statement-breakpoint
ALTER TABLE "setups" DROP CONSTRAINT "setups_user_name_uq";--> statement-breakpoint
ALTER TABLE "setups" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_trades" ADD COLUMN "exit_reason" "exit_reason";--> statement-breakpoint
ALTER TABLE "confluences" ADD CONSTRAINT "confluences_scope_label_uq" UNIQUE NULLS NOT DISTINCT("user_id","label");--> statement-breakpoint
ALTER TABLE "emotional_states" ADD CONSTRAINT "emotional_states_scope_label_uq" UNIQUE NULLS NOT DISTINCT("user_id","label");--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_user_name_uq" UNIQUE NULLS NOT DISTINCT("user_id","name");