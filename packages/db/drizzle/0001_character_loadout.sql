CREATE TABLE "loadout" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"class_id" character_class NOT NULL,
	"abilities" jsonb NOT NULL,
	"tactics" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" DROP CONSTRAINT "character_points_check";--> statement-breakpoint
ALTER TABLE "loadout" ADD CONSTRAINT "loadout_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loadout_character_class_idx" ON "loadout" USING btree ("character_id","class_id");--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "unspent_points";--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_points_check" CHECK ("character"."xp" >= 0 AND "character"."attr_str" >= 0 AND "character"."attr_dex" >= 0 AND "character"."attr_int" >= 0 AND "character"."attr_con" >= 0);