ALTER TYPE "public"."fight_kind" ADD VALUE 'league';--> statement-breakpoint
CREATE TABLE "league_cycle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_cycle_status_check" CHECK ("league_cycle"."status" IN ('active', 'finished'))
);
--> statement-breakpoint
CREATE TABLE "league_match" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"division" integer NOT NULL,
	"matchday" integer NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"play_at" timestamp with time zone NOT NULL,
	"a_character_id" uuid,
	"b_character_id" uuid,
	"status" text NOT NULL,
	"snapshots" jsonb,
	"fight_id" uuid,
	"winner_character_id" uuid,
	"draw" boolean DEFAULT false NOT NULL,
	CONSTRAINT "league_match_status_check" CHECK ("league_match"."status" IN ('scheduled', 'locked', 'played', 'bye'))
);
--> statement-breakpoint
CREATE TABLE "league_member" (
	"cycle_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"division" integer NOT NULL,
	"rating_at_start" double precision NOT NULL,
	"place" integer,
	"movement" text,
	CONSTRAINT "league_member_cycle_id_character_id_pk" PRIMARY KEY("cycle_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"rating" double precision NOT NULL,
	"rd" double precision NOT NULL,
	"volatility" double precision NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"league_joined" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_cycle" ADD CONSTRAINT "league_cycle_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_match" ADD CONSTRAINT "league_match_cycle_id_league_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."league_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_match" ADD CONSTRAINT "league_match_a_character_id_character_id_fk" FOREIGN KEY ("a_character_id") REFERENCES "public"."character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_match" ADD CONSTRAINT "league_match_b_character_id_character_id_fk" FOREIGN KEY ("b_character_id") REFERENCES "public"."character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_match" ADD CONSTRAINT "league_match_fight_id_fight_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member" ADD CONSTRAINT "league_member_cycle_id_league_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."league_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member" ADD CONSTRAINT "league_member_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_cycle_season_number_idx" ON "league_cycle" USING btree ("season_id","number");--> statement-breakpoint
CREATE INDEX "league_match_cycle_idx" ON "league_match" USING btree ("cycle_id","division","matchday");--> statement-breakpoint
CREATE INDEX "league_match_due_idx" ON "league_match" USING btree ("status","lock_at","play_at");--> statement-breakpoint
CREATE INDEX "league_member_character_idx" ON "league_member" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "rating_season_rating_idx" ON "rating" USING btree ("season_id","rating");