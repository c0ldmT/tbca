ALTER TYPE "public"."fight_kind" ADD VALUE 'training';--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;