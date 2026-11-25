CREATE TYPE "public"."ring_event_kind" AS ENUM('deposit', 'withdraw', 'interface_created');--> statement-breakpoint
CREATE TABLE "coins" (
	"mint" text PRIMARY KEY NOT NULL,
	"symbol" text,
	"name" text,
	"image_uri" text,
	"token_program" text NOT NULL,
	"decimals" smallint NOT NULL,
	"vault" text NOT NULL,
	"is_pump" boolean DEFAULT false NOT NULL,
	"launched_via_crypsis" boolean DEFAULT false NOT NULL,
	"creator" text,
	"created_at" timestamp with time zone,
	"ring_ready_at" timestamp with time zone,
	"graduated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"mint" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"create_sig" text NOT NULL,
	"interface_sig" text,
	"shield_sig" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ring_events" (
	"signature" text NOT NULL,
	"ix_index" integer NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"mint" text NOT NULL,
	"kind" "ring_event_kind" NOT NULL,
	"amount" numeric(40, 0),
	"from_addr" text,
	"to_addr" text,
	CONSTRAINT "ring_events_signature_ix_index_pk" PRIMARY KEY("signature","ix_index")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"mint" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"vault_amount" numeric(40, 0) NOT NULL,
	"total_supply" numeric(40, 0) NOT NULL,
	"circulating" numeric(40, 0),
	"share_bps" integer NOT NULL,
	CONSTRAINT "snapshots_mint_ts_pk" PRIMARY KEY("mint","ts")
);
--> statement-breakpoint
CREATE INDEX "coins_is_pump_idx" ON "coins" USING btree ("is_pump");--> statement-breakpoint
CREATE INDEX "ring_events_mint_time_idx" ON "ring_events" USING btree ("mint","block_time");--> statement-breakpoint
CREATE INDEX "ring_events_time_idx" ON "ring_events" USING btree ("block_time");--> statement-breakpoint
CREATE INDEX "snapshots_ts_idx" ON "snapshots" USING btree ("ts");