import { DEFAULT_BATTLE_RULES, DEFAULT_GAME_CONFIG } from '@tbca/game-core';

import type { Database } from './client.js';
import { community, configVersion, season, type SeasonConfigData } from './schema.js';

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
}
