CREATE TYPE "public"."dungeon_run_status" AS ENUM('active', 'left', 'timed_out', 'defeated', 'saved');--> statement-breakpoint
ALTER TYPE "public"."fight_kind" ADD VALUE 'dungeon';--> statement-breakpoint
CREATE TABLE "dungeon_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"status" "dungeon_run_status" DEFAULT 'active' NOT NULL,
	"floor" integer DEFAULT 0 NOT NULL,
	"seed" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"hp" integer NOT NULL,
	"energy" integer NOT NULL,
	"injectors" integer DEFAULT 0 NOT NULL,
	"backup_chip" boolean DEFAULT false NOT NULL,
	"loot" jsonb NOT NULL,
	"xp_gained" integer DEFAULT 0 NOT NULL,
	"last_fight_id" uuid,
	"reward_day" text NOT NULL,
	"last_action_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dungeon_run" ADD CONSTRAINT "dungeon_run_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_run" ADD CONSTRAINT "dungeon_run_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_run" ADD CONSTRAINT "dungeon_run_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dungeon_run_character_idx" ON "dungeon_run" USING btree ("character_id","reward_day");--> statement-breakpoint
CREATE UNIQUE INDEX "dungeon_run_single_active_idx" ON "dungeon_run" USING btree ("character_id") WHERE "dungeon_run"."status" = 'active';