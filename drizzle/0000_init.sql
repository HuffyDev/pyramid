CREATE TABLE "launches" (
	"launch_id" text PRIMARY KEY NOT NULL,
	"mint" text NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_uri" text,
	"metadata_uri" text NOT NULL,
	"website" text,
	"twitter" text,
	"telegram" text,
	"creator" text NOT NULL,
	"dev_buy_sol" double precision DEFAULT 0 NOT NULL,
	"signature" text,
	"status" text DEFAULT 'building' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placed_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"market_cap_usd" double precision,
	"change_24h" double precision,
	"below_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "launches_mint_idx" ON "launches" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "launches_created_idx" ON "launches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "launches_placed_idx" ON "launches" USING btree ("placed_at");