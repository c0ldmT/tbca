ALTER TABLE "account" ADD COLUMN "bot_agent" text;--> statement-breakpoint
-- Vorhandene Bots reihum mit Agententypen versehen.
UPDATE "account" AS a SET "bot_agent" = (ARRAY['casual','active','farmer','climber','class_switcher'])[1 + (n.rn % 5)]
FROM (SELECT id, (row_number() OVER (ORDER BY created_at, id)) - 1 AS rn FROM "account" WHERE is_bot AND bot_agent IS NULL) AS n
WHERE a.id = n.id;
