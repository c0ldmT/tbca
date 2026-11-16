CREATE TYPE "public"."equip_slot" AS ENUM('head', 'torso', 'legs', 'feet', 'hands', 'main_hand', 'off_hand', 'implant_1', 'implant_2', 'core_implant');--> statement-breakpoint
CREATE TYPE "public"."item_binding" AS ENUM('account', 'tradeable');--> statement-breakpoint
CREATE TABLE "equipment" (
	"character_id" uuid NOT NULL,
	"slot" "equip_slot" NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "equipment_character_id_slot_pk" PRIMARY KEY("character_id","slot"),
	CONSTRAINT "equipment_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "item_instance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"item_level" integer NOT NULL,
	"rarity" integer NOT NULL,
	"budget" integer NOT NULL,
	"data" jsonb NOT NULL,
	"binding" "item_binding" DEFAULT 'account' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_instance_values_check" CHECK ("item_instance"."item_level" >= 1 AND "item_instance"."rarity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_item_id_item_instance_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance" ADD CONSTRAINT "item_instance_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instance" ADD CONSTRAINT "item_instance_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_instance_owner_idx" ON "item_instance" USING btree ("account_id","season_id");