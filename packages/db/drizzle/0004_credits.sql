CREATE TABLE "credit_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"account_id" uuid,
	"system_account" text,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "wallet_season_id_account_id_pk" PRIMARY KEY("season_id","account_id"),
	CONSTRAINT "wallet_balance_check" CHECK ("wallet"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fight_participant" ADD COLUMN "credits_awarded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_transaction_id_credit_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."credit_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entry_account_idx" ON "credit_entry" USING btree ("season_id","account_id");--> statement-breakpoint
CREATE INDEX "credit_entry_transaction_idx" ON "credit_entry" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "credit_transaction_season_kind_idx" ON "credit_transaction" USING btree ("season_id","kind","created_at");