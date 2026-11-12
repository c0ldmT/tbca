import { Inject, Injectable } from '@nestjs/common';
import { medianLevel, withCatchUp, type GameConfig } from '@tbca/game-core';

import type { CharacterRepository } from '../character/types.js';
import type { RateLimiter } from '../limits/rate-limiter.js';
import { CHARACTER_REPOSITORY, RATE_LIMITER } from '../tokens.js';

/** So lange gilt ein berechneter Median; der Worker frischt ihn alle 10 Minuten auf. */
const MEDIAN_TTL_MS = 30 * 60_000;

/**
 * Season-weite Fortschrittswerte. Der Median-Level wird vom Worker (Job „season-stats“)
 * berechnet und in Valkey abgelegt, damit alle API-Prozesse denselben Wert nutzen; fehlt er,
 * wird er einmal direkt berechnet.
 */
@Injectable()
export class ProgressionService {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(RATE_LIMITER) private readonly store: RateLimiter,
  ) {}

  /** Berechnet den Median-Level der Season (ohne Bot-Spieler) neu und legt ihn ab. */
  async refreshMedian(seasonId: string): Promise<number> {
    const median = medianLevel(await this.characters.levels(seasonId));
    await this.store.remember(this.key(seasonId), String(median), MEDIAN_TTL_MS);
    return median;
  }

  async median(seasonId: string): Promise<number> {
    const cached = await this.store.recall(this.key(seasonId));
    return cached === null ? this.refreshMedian(seasonId) : Number(cached);
  }

  /** Wendet den Aufholbonus auf eine Belohnung an (nur XP). */
  boost<T extends { xp: number }>(game: GameConfig, reward: T, level: number, median: number): T {
    return { ...reward, xp: withCatchUp(game, reward.xp, level, median) };
  }

  private key(seasonId: string): string {
    return `season:${seasonId}:median-level`;
  }
}
