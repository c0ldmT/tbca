import {
  BOT_NAMES,
  botBuild,
  CLASS_IDS,
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  defaultLoadout,
  totalXpForLevel,
  type GameConfig,
} from '@tbca/game-core';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import {
  account,
  character,
  community,
  communityMember,
  team,
  teamMember,
  configVersion,
  loadout,
  season,
  type SeasonConfigData,
} from './schema.js';

const DAY = 24 * 60 * 60 * 1000;

/** Format-Version von SeasonConfigData. */
export const CONFIG_SCHEMA_VERSION = 2;

export const DEV_SEASON_SLUG = 'dev';
export const DEV_COMMUNITY_SLUG = 'dev';

/**
 * Entwicklungsdaten: eine aktive Test-Season mit veröffentlichter Konfiguration und eine
 * Community. Idempotent – mehrfaches Ausführen ändert nichts.
 */
export async function seedDevelopment(db: Database, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [devSeason] = await tx
      .insert(season)
      .values({
        slug: DEV_SEASON_SLUG,
        name: 'Dev Season',
        status: 'active',
        isTest: true,
        startsAt: now,
        endsAt: new Date(now.getTime() + 42 * DAY),
      })
      .onConflictDoNothing({ target: season.slug })
      .returning({ id: season.id });

    if (devSeason) {
      const data: SeasonConfigData = {
        battle: { ...DEFAULT_BATTLE_RULES },
        game: DEFAULT_GAME_CONFIG,
      };
      await tx.insert(configVersion).values({
        seasonId: devSeason.id,
        version: 1,
        schemaVersion: CONFIG_SCHEMA_VERSION,
        status: 'published',
        data,
        notes: 'Startwerte aus der Spezifikation',
        publishedAt: now,
      });
    }

    await tx
      .insert(community)
      .values({ slug: DEV_COMMUNITY_SLUG, name: 'Dev Community', defaultLocale: 'de' })
      .onConflictDoNothing({ target: community.slug });
  });

  const [dev] = await db
    .select({ id: season.id })
    .from(season)
    .where(eq(season.slug, DEV_SEASON_SLUG));
  if (dev) {
    await seedBots(db, dev.id);
    await seedBotTeams(db, dev.id);
  }
}

/**
 * Zwei Bot-Teams in der Dev-Community, damit sich Team-Herausforderungen allein testen lassen.
 * Beitrittscodes BOTCHW und BOTNEON.
 */
export async function seedBotTeams(db: Database, seasonId: string): Promise<void> {
  const [dev] = await db
    .select({ id: community.id })
    .from(community)
    .where(eq(community.slug, DEV_COMMUNITY_SLUG));
  if (!dev) return;
  const bots = await db
    .select({ accountId: character.accountId, name: character.name, level: character.level })
    .from(character)
    .innerJoin(account, eq(account.id, character.accountId))
    .where(and(eq(character.seasonId, seasonId), eq(account.isBot, true)));
  const plans = [
    { name: 'Chrome Wolves', tag: 'CHW', logo: 'wolf', levels: [1, 3] },
    { name: 'Neon Saints', tag: 'NEON', logo: 'halo', levels: [6, 10] },
  ];
  for (const plan of plans) {
    const [exists] = await db
      .select({ id: team.id })
      .from(team)
      .where(sql`lower(${team.tag}) = lower(${plan.tag})`);
    if (exists) continue;
    // Vier Bots je Team: so bleiben zwei Plätze, um selbst beizutreten.
    const members = bots.filter((b) => plan.levels.includes(b.level)).slice(0, 4);
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(team)
        .values({
          communityId: dev.id,
          name: plan.name,
          tag: plan.tag,
          logo: plan.logo,
          captainAccountId: members[0]?.accountId ?? null,
          joinCode: `BOT${plan.tag}`,
          lineup2: members.slice(0, 2).map((m) => m.accountId),
          lineup3: members.slice(0, 3).map((m) => m.accountId),
        })
        .returning({ id: team.id });
      for (const m of members) {
        await tx
          .insert(communityMember)
          .values({ communityId: dev.id, accountId: m.accountId, isHome: true })
          .onConflictDoNothing();
        await tx
          .insert(teamMember)
          .values({ teamId: row!.id, accountId: m.accountId, communityId: dev.id });
      }
    });
  }
}

/** Agententypen der Bot-Spieler (Abschnitt 14); reihum vergeben. */
export const BOT_AGENTS = ['casual', 'active', 'farmer', 'climber', 'class_switcher'] as const;
export type BotAgent = (typeof BOT_AGENTS)[number];

/** Stufen der Bot-Gegner: je Klasse eine Bandbreite für frühe Level. */
export const BOT_LEVELS = [1, 3, 6, 10] as const;

/**
 * Legt Bot-Gegner in einer Season an: jede Klasse auf jeder Stufe aus BOT_LEVELS, mit
 * plausibler Punkteverteilung. Idempotent über den Namen; vorhandene Bots bleiben unverändert.
 * Belohnungen gegen Bots gibt es nur in Test-Seasons.
 */
export async function seedBots(
  db: Database,
  seasonId: string,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): Promise<number> {
  let created = 0;
  let index = 0;
  for (const level of BOT_LEVELS) {
    for (const classId of CLASS_IDS) {
      const name = `${BOT_NAMES[index % BOT_NAMES.length]}`;
      index++;
      const [exists] = await db
        .select({ id: character.id })
        .from(character)
        .where(
          and(eq(character.seasonId, seasonId), sql`lower(${character.name}) = lower(${name})`),
        );
      if (exists) continue;

      await db.transaction(async (tx) => {
        const [bot] = await tx
          .insert(account)
          .values({ isBot: true })
          .returning({ id: account.id });
        const build = botBuild(config, {
          id: '',
          name,
          classId,
          level,
          seed: `${seasonId}:${name}`,
        });
        const [row] = await tx
          .insert(character)
          .values({
            accountId: bot!.id,
            seasonId,
            name,
            class: classId,
            level,
            xp: totalXpForLevel(config, level),
            attrStr: build.allocated.str,
            attrDex: build.allocated.dex,
            attrInt: build.allocated.int,
            attrCon: build.allocated.con,
          })
          .returning({ id: character.id });
        const lo = defaultLoadout(config, classId, level);
        await tx.insert(loadout).values({
          characterId: row!.id,
          classId,
          abilities: [...lo.abilities],
          tactics: [...lo.tactics],
        });
      });
      created++;
    }
  }
  return created;
}
