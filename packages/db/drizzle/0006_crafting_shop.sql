CREATE TABLE "material_stack" (
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"stack_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "material_stack_season_id_account_id_stack_id_pk" PRIMARY KEY("season_id","account_id","stack_id"),
	CONSTRAINT "material_stack_quantity_check" CHECK ("material_stack"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_purchase" (
	"season_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"day" text NOT NULL,
	"offer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_purchase_season_id_account_id_day_offer_id_pk" PRIMARY KEY("season_id","account_id","day","offer_id")
);
--> statement-breakpoint
ALTER TABLE "material_stack" ADD CONSTRAINT "material_stack_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_stack" ADD CONSTRAINT "material_stack_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchase" ADD CONSTRAINT "shop_purchase_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchase" ADD CONSTRAINT "shop_purchase_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;