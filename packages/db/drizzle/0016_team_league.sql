ALTER TYPE "public"."fight_kind" ADD VALUE 'team_league';--> statement-breakpoint
CREATE TABLE "team_league_cycle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"size" integer NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_league_cycle_status_check" CHECK ("team_league_cycle"."status" IN ('active', 'finished')),
	CONSTRAINT "team_league_cycle_size_check" CHECK ("team_league_cycle"."size" IN (2, 3))
);
--> statement-breakpoint
CREATE TABLE "team_league_match" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"division" integer NOT NULL,
	"matchday" integer NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"play_at" timestamp with time zone NOT NULL,
	"a_team_id" uuid,
	"b_team_id" uuid,
	"status" text NOT NULL,
	"snapshots" jsonb,
	"fight_id" uuid,
	"winner_team_id" uuid,
	"draw" boolean DEFAULT false NOT NULL,
	CONSTRAINT "team_league_match_status_check" CHECK ("team_league_match"."status" IN ('scheduled', 'locked', 'played', 'bye'))
);
--> statement-breakpoint
CREATE TABLE "team_league_member" (
	"cycle_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"division" integer NOT NULL,
	"rating_at_start" double precision NOT NULL,
	"place" integer,
	"movement" text,
	CONSTRAINT "team_league_member_cycle_id_team_id_pk" PRIMARY KEY("cycle_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "team_rating" (
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"size" integer NOT NULL,
	"rating" double precision NOT NULL,
	"rd" double precision NOT NULL,
	"volatility" double precision NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"league_joined" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_rating_team_id_season_id_size_pk" PRIMARY KEY("team_id","season_id","size"),
	CONSTRAINT "team_rating_size_check" CHECK ("team_rating"."size" IN (2, 3))
);
--> statement-breakpoint
ALTER TABLE "team_league_cycle" ADD CONSTRAINT "team_league_cycle_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_match" ADD CONSTRAINT "team_league_match_cycle_id_team_league_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."team_league_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_match" ADD CONSTRAINT "team_league_match_a_team_id_team_id_fk" FOREIGN KEY ("a_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_match" ADD CONSTRAINT "team_league_match_b_team_id_team_id_fk" FOREIGN KEY ("b_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_match" ADD CONSTRAINT "team_league_match_fight_id_fight_id_fk" FOREIGN KEY ("fight_id") REFERENCES "public"."fight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_member" ADD CONSTRAINT "team_league_member_cycle_id_team_league_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."team_league_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_member" ADD CONSTRAINT "team_league_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rating" ADD CONSTRAINT "team_rating_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rating" ADD CONSTRAINT "team_rating_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_league_cycle_season_size_number_idx" ON "team_league_cycle" USING btree ("season_id","size","number");--> statement-breakpoint
CREATE INDEX "team_league_match_cycle_idx" ON "team_league_match" USING btree ("cycle_id","division","matchday");--> statement-breakpoint
CREATE INDEX "team_league_match_due_idx" ON "team_league_match" USING btree ("status","lock_at","play_at");--> statement-breakpoint
CREATE INDEX "team_league_member_team_idx" ON "team_league_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_rating_season_size_idx" ON "team_rating" USING btree ("season_id","size","rating");