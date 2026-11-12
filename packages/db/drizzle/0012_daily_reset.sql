CREATE TABLE "daily_reset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"character_id" uuid,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reset_kind_check" CHECK ("daily_reset"."kind" IN ('dungeon', 'fights'))
);
--> statement-breakpoint
ALTER TABLE "daily_reset" ADD CONSTRAINT "daily_reset_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reset" ADD CONSTRAINT "daily_reset_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_reset_lookup_idx" ON "daily_reset" USING btree ("season_id","day","kind");