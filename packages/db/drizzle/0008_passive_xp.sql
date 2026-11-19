CREATE TABLE "xp_ledger_daily" (
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"day" text NOT NULL,
	"passive_raw" integer DEFAULT 0 NOT NULL,
	"passive_awarded" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "xp_ledger_daily_season_id_account_id_day_pk" PRIMARY KEY("season_id","account_id","day")
);
--> statement-breakpoint
ALTER TABLE "xp_ledger_daily" ADD CONSTRAINT "xp_ledger_daily_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger_daily" ADD CONSTRAINT "xp_ledger_daily_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;