CREATE TYPE "public"."checklist_compliance" AS ENUM('in_plan', 'out_of_plan');--> statement-breakpoint
CREATE TYPE "public"."execution_timeframe" AS ENUM('1m', '5m', '15m', '1H', '4H', 'D', 'W');--> statement-breakpoint
CREATE TYPE "public"."htf_bias" AS ENUM('bullish', 'bearish', 'range', 'undefined');--> statement-breakpoint
CREATE TYPE "public"."manual_source" AS ENUM('hand', 'csv_import', 'pdf_import');--> statement-breakpoint
CREATE TYPE "public"."market_session" AS ENUM('asia', 'london', 'ny');--> statement-breakpoint
CREATE TYPE "public"."mentor_analysis_category" AS ENUM('psychological', 'thesis');--> statement-breakpoint
CREATE TYPE "public"."not_taken_reason" AS ENUM('fear', 'doubt', 'missed_in_time', 'outside_session', 'risk_limit_reached', 'other');--> statement-breakpoint
CREATE TYPE "public"."profit_calc_method" AS ENUM('fifo', 'lifo', 'wavg');--> statement-breakpoint
CREATE TYPE "public"."public_profile_level" AS ENUM('none', 'summary', 'metrics', 'detail');--> statement-breakpoint
CREATE TYPE "public"."radar_axis" AS ENUM('win_rate', 'profit_factor', 'avg_win_loss', 'consistency', 'risk_management', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."stat_book" AS ENUM('verified', 'not_taken', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."stat_metric" AS ENUM('win_rate', 'expectancy', 'r_multiple_avg', 'profit_factor', 'max_drawdown', 'streaks', 'sharpe_ratio', 'z_score', 'radar_axis', 'radar_composite');--> statement-breakpoint
CREATE TYPE "public"."trade_outcome" AS ENUM('win', 'loss', 'breakeven');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."trading_account_kind" AS ENUM('broker_synced', 'manual');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('free', 'mentor');--> statement-breakpoint
CREATE TABLE "annotation_confluences" (
	"annotation_id" uuid NOT NULL,
	"confluence_id" uuid NOT NULL,
	CONSTRAINT "annotation_confluences_pk" PRIMARY KEY("annotation_id","confluence_id")
);
--> statement-breakpoint
CREATE TABLE "annotation_emotional_states" (
	"annotation_id" uuid NOT NULL,
	"emotional_state_id" uuid NOT NULL,
	CONSTRAINT "annotation_emo_states_pk" PRIMARY KEY("annotation_id","emotional_state_id")
);
--> statement-breakpoint
CREATE TABLE "confluences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"label" text NOT NULL,
	CONSTRAINT "confluences_scope_label_uq" UNIQUE("user_id","label")
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trading_account_id" uuid,
	"metaapi_account_id" text NOT NULL,
	"broker" text,
	"server" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emotional_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"label" text NOT NULL,
	CONSTRAINT "emotional_states_scope_label_uq" UNIQUE("user_id","label")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_failed" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trading_account_id" uuid,
	"verified" boolean DEFAULT false NOT NULL,
	"source" "manual_source" DEFAULT 'hand' NOT NULL,
	"import_batch_id" uuid,
	"instrument" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"volume" numeric(20, 8) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"commission" numeric(20, 8) DEFAULT '0' NOT NULL,
	"swap" numeric(20, 8) DEFAULT '0' NOT NULL,
	"pnl_currency" numeric(20, 8) NOT NULL,
	"pnl_r" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_never_verified" CHECK ("manual_trades"."verified" = false)
);
--> statement-breakpoint
CREATE TABLE "mentor_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"category" "mentor_analysis_category" NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"note" text NOT NULL,
	"trade_ids" jsonb NOT NULL,
	"data_scope" text NOT NULL,
	"model" text NOT NULL,
	"engine_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "not_taken_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trading_account_id" uuid,
	"instrument" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"identified_at" timestamp with time zone NOT NULL,
	"reason" "not_taken_reason" NOT NULL,
	"planned_entry" numeric(20, 8),
	"planned_stop" numeric(20, 8),
	"planned_target" numeric(20, 8),
	"hypothetical_outcome" "trade_outcome",
	"hypothetical_pnl_r" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"verified_trade_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_annotations_trade_version_uq" UNIQUE("verified_trade_id","version")
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"family" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setups_user_name_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "stat_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric" "stat_metric" NOT NULL,
	"axis" "radar_axis",
	"book" "stat_book" NOT NULL,
	"sealed" boolean NOT NULL,
	"value" numeric(20, 8),
	"insufficient_data" boolean DEFAULT false NOT NULL,
	"detail" jsonb,
	"sample_size" integer NOT NULL,
	"verified_period_start" timestamp with time zone,
	"verified_period_end" timestamp with time zone,
	"engine_version" text NOT NULL,
	"filters_hash" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_seal_only_verified" CHECK ("stat_snapshots"."book" = 'verified' or "stat_snapshots"."sealed" = false)
);
--> statement-breakpoint
CREATE TABLE "trade_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"verified_trade_id" uuid,
	"manual_trade_id" uuid,
	"not_taken_trade_id" uuid,
	"setup_id" uuid,
	"setup_family" text,
	"htf_bias" "htf_bias",
	"execution_timeframe" "execution_timeframe",
	"market_session" "market_session",
	"checklist_compliance" "checklist_compliance",
	"stop_loss" numeric(20, 8),
	"profit_target" numeric(20, 8),
	"extra" jsonb,
	"journal_note" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_annotations_verified_uq" UNIQUE("verified_trade_id"),
	CONSTRAINT "trade_annotations_manual_uq" UNIQUE("manual_trade_id"),
	CONSTRAINT "trade_annotations_not_taken_uq" UNIQUE("not_taken_trade_id"),
	CONSTRAINT "annotation_exactly_one_book" CHECK ((
        ("trade_annotations"."verified_trade_id" is not null)::int
        + ("trade_annotations"."manual_trade_id" is not null)::int
        + ("trade_annotations"."not_taken_trade_id" is not null)::int
      ) = 1)
);
--> statement-breakpoint
CREATE TABLE "trade_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annotation_id" uuid NOT NULL,
	"key" text NOT NULL,
	"thumb_key" text,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verified_trade_id" uuid NOT NULL,
	"broker_deal_id" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"fee" numeric(20, 8) DEFAULT '0' NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_executions_trade_deal_uq" UNIQUE("verified_trade_id","broker_deal_id")
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "trading_account_kind" NOT NULL,
	"profit_calc_method" "profit_calc_method" DEFAULT 'fifo' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"initial_balance" numeric(20, 8),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_accounts_user_name_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider_id" text NOT NULL,
	"handle" text NOT NULL,
	"email" text NOT NULL,
	"tier" "user_tier" DEFAULT 'free' NOT NULL,
	"public_profile_level" "public_profile_level" DEFAULT 'none' NOT NULL,
	"delay_window_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_provider_id_unique" UNIQUE("auth_provider_id"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verified_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connected_account_id" uuid NOT NULL,
	"broker_trade_id" text NOT NULL,
	"instrument" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"volume" numeric(20, 8) NOT NULL,
	"entry_price" numeric(20, 8) NOT NULL,
	"exit_price" numeric(20, 8) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"commission" numeric(20, 8) DEFAULT '0' NOT NULL,
	"swap" numeric(20, 8) DEFAULT '0' NOT NULL,
	"pnl_currency" numeric(20, 8) NOT NULL,
	"pnl_r" numeric(12, 6),
	"engine_ingest_version" text DEFAULT '0' NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_trades_account_broker_uq" UNIQUE("connected_account_id","broker_trade_id")
);
--> statement-breakpoint
ALTER TABLE "annotation_confluences" ADD CONSTRAINT "annotation_confluences_annotation_id_trade_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."trade_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_confluences" ADD CONSTRAINT "annotation_confluences_confluence_id_confluences_id_fk" FOREIGN KEY ("confluence_id") REFERENCES "public"."confluences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_emotional_states" ADD CONSTRAINT "annotation_emo_states_annotation_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."trade_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_emotional_states" ADD CONSTRAINT "annotation_emo_states_emo_state_fk" FOREIGN KEY ("emotional_state_id") REFERENCES "public"."emotional_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confluences" ADD CONSTRAINT "confluences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emotional_states" ADD CONSTRAINT "emotional_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_trades" ADD CONSTRAINT "manual_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_trades" ADD CONSTRAINT "manual_trades_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_trades" ADD CONSTRAINT "manual_trades_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_observations" ADD CONSTRAINT "mentor_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "not_taken_trades" ADD CONSTRAINT "not_taken_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "not_taken_trades" ADD CONSTRAINT "not_taken_trades_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_annotations" ADD CONSTRAINT "public_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_annotations" ADD CONSTRAINT "public_annotations_verified_trade_id_verified_trades_id_fk" FOREIGN KEY ("verified_trade_id") REFERENCES "public"."verified_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_snapshots" ADD CONSTRAINT "stat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_annotations" ADD CONSTRAINT "trade_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_annotations" ADD CONSTRAINT "trade_annotations_verified_trade_id_verified_trades_id_fk" FOREIGN KEY ("verified_trade_id") REFERENCES "public"."verified_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_annotations" ADD CONSTRAINT "trade_annotations_manual_trade_id_manual_trades_id_fk" FOREIGN KEY ("manual_trade_id") REFERENCES "public"."manual_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_annotations" ADD CONSTRAINT "trade_annotations_not_taken_trade_id_not_taken_trades_id_fk" FOREIGN KEY ("not_taken_trade_id") REFERENCES "public"."not_taken_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_annotations" ADD CONSTRAINT "trade_annotations_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_attachments" ADD CONSTRAINT "trade_attachments_annotation_id_trade_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."trade_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_verified_trade_id_verified_trades_id_fk" FOREIGN KEY ("verified_trade_id") REFERENCES "public"."verified_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_trades" ADD CONSTRAINT "verified_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_trades" ADD CONSTRAINT "verified_trades_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connected_accounts_user_idx" ON "connected_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connected_accounts_trading_account_idx" ON "connected_accounts" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "manual_user_closed_idx" ON "manual_trades" USING btree ("user_id","closed_at");--> statement-breakpoint
CREATE INDEX "manual_trading_account_idx" ON "manual_trades" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "manual_import_batch_idx" ON "manual_trades" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "mentor_observations_user_idx" ON "mentor_observations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "not_taken_user_idx" ON "not_taken_trades" USING btree ("user_id","identified_at");--> statement-breakpoint
CREATE INDEX "not_taken_trading_account_idx" ON "not_taken_trades" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "public_annotations_user_idx" ON "public_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "snapshot_lookup_idx" ON "stat_snapshots" USING btree ("user_id","metric","filters_hash","engine_version");--> statement-breakpoint
CREATE INDEX "trade_annotations_user_idx" ON "trade_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_annotations_setup_idx" ON "trade_annotations" USING btree ("setup_id");--> statement-breakpoint
CREATE INDEX "trade_attachments_annotation_idx" ON "trade_attachments" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "trade_executions_trade_idx" ON "trade_executions" USING btree ("verified_trade_id","executed_at");--> statement-breakpoint
CREATE INDEX "verified_user_closed_idx" ON "verified_trades" USING btree ("user_id","closed_at");