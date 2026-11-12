CREATE TABLE "daily_team_opponent" (
	"team_id" uuid NOT NULL,
	"day" text NOT NULL,
	"slot" integer NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	CONSTRAINT "daily_team_opponent_team_id_day_slot_pk" PRIMARY KEY("team_id","day","slot")
);
--> statement-breakpoint
CREATE TABLE "team_challenge_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"challenger_team_id" uuid NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"requester_account_id" uuid NOT NULL,
	"size" integer NOT NULL,
	"lineup" jsonb NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fight_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_challenge_request_status_check" CHECK ("team_challenge_request"."status" IN ('pending', 'accepted', 'declined', 'expired')),
	CONSTRAINT "team_challenge_request_size_check" CHECK ("team_challenge_request"."size" IN (2, 3))
);
--> statement-breakpoint
ALTER TABLE "daily_team_opponent" ADD CONSTRAINT "daily_team_opponent_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_team_opponent" ADD CONSTRAINT "daily_team_opponent_opponent_team_id_team_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_challenge_request" ADD CONSTRAINT "team_challenge_request_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_challenge_request" ADD CONSTRAINT "team_challenge_request_challenger_team_id_team_id_fk" FOREIGN KEY ("challenger_team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_challenge_request" ADD CONSTRAINT "team_challenge_request_opponent_team_id_team_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_challenge_request" ADD CONSTRAINT "team_challenge_request_requester_account_id_account_id_fk" FOREIGN KEY ("requester_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_challenge_request" ADD CONSTRAINT "team_challenge_request_fight_id_fight_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_challenge_request_opponent_idx" ON "team_challenge_request" USING btree ("opponent_team_id","status");