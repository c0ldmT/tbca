CREATE TYPE "public"."channel_kind" AS ENUM('discord_guild', 'discord_channel', 'twitch_channel');--> statement-breakpoint
CREATE TYPE "public"."character_class" AS ENUM('bruiser', 'gunner', 'netrunner', 'medtech');--> statement-breakpoint
CREATE TYPE "public"."community_role" AS ENUM('member', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."config_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."global_role" AS ENUM('player', 'superadmin');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('discord', 'twitch');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('de', 'en');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('planned', 'active', 'ended');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"global_role" "global_role" DEFAULT 'player' NOT NULL,
	"locale" "locale",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class" character_class DEFAULT 'bruiser' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"attr_str" integer DEFAULT 0 NOT NULL,
	"attr_dex" integer DEFAULT 0 NOT NULL,
	"attr_int" integer DEFAULT 0 NOT NULL,
	"attr_con" integer DEFAULT 0 NOT NULL,
	"unspent_points" integer DEFAULT 0 NOT NULL,
	"renamed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_name_length_check" CHECK (char_length("character"."name") BETWEEN 3 AND 20),
	CONSTRAINT "character_level_check" CHECK ("character"."level" >= 1),
	CONSTRAINT "character_points_check" CHECK ("character"."xp" >= 0 AND "character"."attr_str" >= 0 AND "character"."attr_dex" >= 0 AND "character"."attr_int" >= 0 AND "character"."attr_con" >= 0 AND "character"."unspent_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "community" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" "locale" DEFAULT 'de' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_channel" (
	"id" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"external_id" text NOT NULL,
	"parent_external_id" text,
	"xp_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_member" (
	"community_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "community_role" DEFAULT 'member' NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"home_changed_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_member_community_id_account_id_pk" PRIMARY KEY("community_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "config_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"notes" text,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "config_version_version_check" CHECK ("config_version"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "season_status" DEFAULT 'planned' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"time_factor" double precision DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_slug_unique" UNIQUE("slug"),
	CONSTRAINT "season_period_check" CHECK ("season"."ends_at" > "season"."starts_at"),
	CONSTRAINT "season_time_factor_check" CHECK ("season"."time_factor" > 0 AND ("season"."is_test" OR "season"."time_factor" = 1))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_channel" ADD CONSTRAINT "community_channel_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity" ADD CONSTRAINT "identity_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_account_season_idx" ON "character" USING btree ("account_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_season_name_idx" ON "character" USING btree ("season_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "community_channel_external_idx" ON "community_channel" USING btree ("kind","external_id");--> statement-breakpoint
CREATE INDEX "community_channel_community_idx" ON "community_channel" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "community_member_account_idx" ON "community_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_member_single_home_idx" ON "community_member" USING btree ("account_id") WHERE "community_member"."is_home";--> statement-breakpoint
CREATE UNIQUE INDEX "config_version_season_version_idx" ON "config_version" USING btree ("season_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "config_version_single_published_idx" ON "config_version" USING btree ("season_id") WHERE "config_version"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_user_idx" ON "identity" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_account_provider_idx" ON "identity" USING btree ("account_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "season_single_active_idx" ON "season" USING btree ("status") WHERE "season"."status" = 'active' AND NOT "season"."is_test";--> statement-breakpoint
CREATE INDEX "session_account_idx" ON "session" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");