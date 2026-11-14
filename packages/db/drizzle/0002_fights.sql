CREATE TYPE "public"."fight_end_reason" AS ENUM('knockout', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."fight_kind" AS ENUM('pvp_rated', 'pvp_friendly');--> statement-breakpoint
CREATE TABLE "fight" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" "fight_kind" NOT NULL,
	"engine_version" integer NOT NULL,
	"config_version" integer NOT NULL,
	"seed" text NOT NULL,
	"input" jsonb NOT NULL,
	"events" "bytea" NOT NULL,
	"log_hash" text NOT NULL,
	"winner_team" integer,
	"reason" "fight_end_reason" NOT NULL,
	"rounds" integer NOT NULL,
	"reward_day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fight_participant" (
	"fight_id" uuid NOT NULL,
	"team" integer NOT NULL,
	"slot" integer NOT NULL,
	"character_id" uuid,
	"initiator" boolean DEFAULT false NOT NULL,
	"won" boolean NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	"opponent_character_id" uuid,
	CONSTRAINT "fight_participant_fight_id_team_slot_pk" PRIMARY KEY("fight_id","team","slot")
);
--> statement-breakpoint
ALTER TABLE "fight" ADD CONSTRAINT "fight_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fight_participant" ADD CONSTRAINT "fight_participant_fight_id_fight_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fight_participant" ADD CONSTRAINT "fight_participant_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fight_season_created_idx" ON "fight" USING btree ("season_id","created_at");--> statement-breakpoint
CREATE INDEX "fight_participant_character_idx" ON "fight_participant" USING btree ("character_id");