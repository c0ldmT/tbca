import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { configVersion, season, type Database } from '@tbca/db';
import {
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  type BattleRules,
  type GameConfig,
  withDefaults,
} from '@tbca/game-core';
import { and, asc, eq } from 'drizzle-orm';

import { ApiError } from '../common/api-error.js';
import { SEASON_REPOSITORY } from '../tokens.js';

/** Die laufende Season mit ihrer veröffentlichten Konfiguration. */
export interface CurrentSeason {
  id: string;
  name: string;
  isTest: boolean;
  configVersion: number;
  battle: BattleRules;
  game: GameConfig;
  /** Spieluhr der Season (nur Test-Seasons weichen von der Echtzeit ab). */
  clock: { factor: number; anchorReal: Date | null; anchorGame: Date | null };
}

export interface SeasonRepository {
  findCurrent(): Promise<CurrentSeason | null>;
  setClock(
    seasonId: string,
    clock: { factor: number; anchorReal: Date; anchorGame: Date },
  ): Promise<void>;
}

export class DrizzleSeasonRepository implements SeasonRepository {
  constructor(private readonly db: Database) {}

  /** Aktive Season, echte vor Test-Seasons, mit ihrer veröffentlichten Konfiguration. */
  async findCurrent(): Promise<CurrentSeason | null> {
    const [row] = await this.db
      .select({
        id: season.id,
        name: season.name,
        isTest: season.isTest,
        version: configVersion.version,
        data: configVersion.data,
        timeFactor: season.timeFactor,
        clockAnchorReal: season.clockAnchorReal,
        clockAnchorGame: season.clockAnchorGame,
      })
      .from(season)
      .innerJoin(
        configVersion,
        and(eq(configVersion.seasonId, season.id), eq(configVersion.status, 'published')),
      )
      .where(eq(season.status, 'active'))
      .orderBy(asc(season.isTest), asc(season.startsAt))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      isTest: row.isTest,
      configVersion: row.version,
      // Ältere Konfigurationen kennen neuere Regelwerte (z. B. triangleBonus) noch nicht.
      battle: withDefaults(DEFAULT_BATTLE_RULES, row.data.battle),
      // Ältere Konfigurationen haben noch nicht alle Bereiche; fehlende kommen aus den Startwerten.
      game: withDefaults(DEFAULT_GAME_CONFIG, row.data.game),
      clock: {
        factor: row.timeFactor,
        anchorReal: row.clockAnchorReal,
        anchorGame: row.clockAnchorGame,
      },
    };
  }

  async setClock(seasonId: string, clock: { factor: number; anchorReal: Date; anchorGame: Date }) {
    await this.db
      .update(season)
      .set({
        timeFactor: clock.factor,
        clockAnchorReal: clock.anchorReal,
        clockAnchorGame: clock.anchorGame,
      })
      .where(eq(season.id, seasonId));
  }
}

@Injectable()
export class SeasonService {
  constructor(@Inject(SEASON_REPOSITORY) private readonly repo: SeasonRepository) {}

  /** Laufende Season oder 503, wenn keine aktiv ist (z. B. zwischen zwei Seasons). */
  async current(): Promise<CurrentSeason> {
    const current = await this.repo.findCurrent();
    if (!current) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'no_active_season', 'Keine Season aktiv');
    }
    return current;
  }
}
