ALTER TYPE "public"."fight_kind" ADD VALUE 'team_rated';--> statement-breakpoint
ALTER TYPE "public"."fight_kind" ADD VALUE 'team_friendly';--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"logo" text NOT NULL,
	"captain_account_id" uuid,
	"join_code" text NOT NULL,
	"focus" text DEFAULT 'threat' NOT NULL,
	"lineup2" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lineup3" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_join_code_unique" UNIQUE("join_code"),
	CONSTRAINT "team_tag_check" CHECK (char_length("team"."tag") BETWEEN 2 AND 5)
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"team_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_team_id_account_id_pk" PRIMARY KEY("team_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "fight_participant" ADD COLUMN "opponent_team_id" uuid;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_captain_account_id_account_id_fk" FOREIGN KEY ("captain_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_name_idx" ON "team" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "team_tag_idx" ON "team" USING btree (lower("tag"));--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_one_per_community_idx" ON "team_member" USING btree ("account_id","community_id");