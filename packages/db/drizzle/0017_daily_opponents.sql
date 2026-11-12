CREATE TABLE "challenge_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fight_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_request_status_check" CHECK ("challenge_request"."status" IN ('pending', 'accepted', 'declined', 'expired')),
	CONSTRAINT "challenge_request_mode_check" CHECK ("challenge_request"."mode" IN ('rated', 'friendly'))
);
--> statement-breakpoint
CREATE TABLE "daily_opponent" (
	"character_id" uuid NOT NULL,
	"day" text NOT NULL,
	"slot" integer NOT NULL,
	"opponent_id" uuid NOT NULL,
	CONSTRAINT "daily_opponent_character_id_day_slot_pk" PRIMARY KEY("character_id","day","slot")
);
--> statement-breakpoint
ALTER TABLE "challenge_request" ADD CONSTRAINT "challenge_request_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_request" ADD CONSTRAINT "challenge_request_challenger_id_character_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_request" ADD CONSTRAINT "challenge_request_opponent_id_character_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_request" ADD CONSTRAINT "challenge_request_fight_id_fight_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_opponent" ADD CONSTRAINT "daily_opponent_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_opponent" ADD CONSTRAINT "daily_opponent_opponent_id_character_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_request_opponent_idx" ON "challenge_request" USING btree ("opponent_id","status");